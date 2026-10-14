import AuthenticationServices
import CommonCrypto
import ExpoModulesCore
import OAuthSwift

/// Expo port of the iOS side of the generic-oauth2 Capacitor plugin
/// (github.com/Davide255/generic-oauth2): same options, same results, same
/// error codes, with the Capacitor bridge replaced by the Expo Modules API.
/// Only the generic OAuth 2 flow is ported (no custom handlers or Sign in with Apple).
public class GenericOAuth2Module: Module {
  static let ERR_GENERAL = "ERR_GENERAL"
  static let ERR_PARAM_NO_APP_ID = "ERR_PARAM_NO_APP_ID"
  static let ERR_PARAM_NO_AUTHORIZATION_BASE_URL = "ERR_PARAM_NO_AUTHORIZATION_BASE_URL"
  static let ERR_PARAM_NO_RESPONSE_TYPE = "ERR_PARAM_NO_RESPONSE_TYPE"
  static let ERR_PARAM_NO_REDIRECT_URL = "ERR_PARAM_NO_REDIRECT_URL"
  static let ERR_PARAM_NO_REFRESH_TOKEN = "ERR_PARAM_NO_REFRESH_TOKEN"
  static let ERR_PARAM_NO_ACCESS_TOKEN_ENDPOINT = "ERR_PARAM_NO_ACCESS_TOKEN_ENDPOINT"
  static let ERR_STATES_NOT_MATCH = "ERR_STATES_NOT_MATCH"
  static let ERR_NO_AUTHORIZATION_CODE = "ERR_NO_AUTHORIZATION_CODE"
  static let ERR_AUTHORIZATION_FAILED = "ERR_AUTHORIZATION_FAILED"
  static let ERR_USER_CANCELLED = "USER_CANCELLED"

  private var oauthSwift: OAuth2Swift?
  private lazy var anchorProvider = PresentationAnchorProvider { [weak self] in
    self?.appContext?.utilities?.currentViewController()?.view.window
  }

  public func definition() -> ModuleDefinition {
    Name("GenericOAuth2")

    AsyncFunction("authenticate") { (options: [String: Any], promise: Promise) in
      self.authenticate(Options(options), promise)
    }
    // ASWebAuthenticationSession has to be started on the main thread.
    .runOnQueue(.main)

    AsyncFunction("refreshToken") { (options: [String: Any], promise: Promise) in
      self.refreshToken(Options(options), promise)
    }

    AsyncFunction("logout") { (_: [String: Any]) -> Bool in
      self.oauthSwift = nil
      return true
    }
  }

  // MARK: - authenticate

  private func authenticate(_ o: Options, _ promise: Promise) {
    guard let appId = o.string("appId"), !appId.isEmpty else {
      return promise.reject(Self.ERR_PARAM_NO_APP_ID, "appId is required")
    }
    guard let baseUrl = o.string("authorizationBaseUrl"), !baseUrl.isEmpty else {
      return promise.reject(Self.ERR_PARAM_NO_AUTHORIZATION_BASE_URL, "authorizationBaseUrl is required")
    }
    guard let responseType = o.string("responseType"), !responseType.isEmpty else {
      return promise.reject(Self.ERR_PARAM_NO_RESPONSE_TYPE, "responseType is required")
    }
    guard let redirectUrl = o.string("redirectUrl"), !redirectUrl.isEmpty else {
      return promise.reject(Self.ERR_PARAM_NO_REDIRECT_URL, "redirectUrl is required")
    }
    let logsEnabled = o.value("logsEnabled") as? Bool ?? false

    let oauthSwift: OAuth2Swift
    if let accessTokenEndpoint = o.string("accessTokenEndpoint"), !accessTokenEndpoint.isEmpty {
      oauthSwift = OAuth2Swift(
        consumerKey: appId,
        consumerSecret: "",  // never ever store the app secret on client!
        authorizeUrl: baseUrl,
        accessTokenUrl: accessTokenEndpoint,
        responseType: responseType
      )
    } else {
      oauthSwift = OAuth2Swift(
        consumerKey: appId,
        consumerSecret: "",
        authorizeUrl: baseUrl,
        responseType: responseType
      )
    }

    // Shared (non-ephemeral) session: the system browser's cookies are reused,
    // so an existing Google login means one tap instead of a full sign-in.
    oauthSwift.authorizeURLHandler = WebAuthenticationURLHandler(
      callbackUrlScheme: URL(string: redirectUrl)?.scheme ?? "",
      presentationContextProvider: anchorProvider,
      prefersEphemeralWebBrowserSession: o.value("prefersEphemeralWebBrowserSession") as? Bool ?? false
    )
    self.oauthSwift = oauthSwift

    let parameters = Self.stringDict(o.value("additionalParameters") as? [String: Any] ?? [:])
    let state = o.string("state") ?? Self.generateRandom(length: 20)
    let scope = o.string("scope") ?? ""
    let completion: OAuthSwift.TokenCompletionHandler = { result in
      self.handleAuthorizationResult(result, promise, logsEnabled)
    }

    if o.value("pkceEnabled") as? Bool ?? false {
      let verifier = Self.generateRandom(length: 64)
      oauthSwift.authorize(
        withCallbackURL: redirectUrl,
        scope: scope,
        state: state,
        codeChallenge: verifier.sha256().base64url(),
        codeVerifier: verifier,
        parameters: parameters,
        completionHandler: completion
      )
    } else {
      oauthSwift.authorize(
        withCallbackURL: redirectUrl,
        scope: scope,
        state: state,
        parameters: parameters,
        completionHandler: completion
      )
    }
  }

  private func handleAuthorizationResult(
    _ result: Result<OAuthSwift.TokenSuccess, OAuthSwiftError>,
    _ promise: Promise,
    _ logsEnabled: Bool
  ) {
    switch result {
    case .success(let (credential, response, parameters)):
      // State is already checked by OAuthSwift.
      if let data = response?.data {
        guard let tokenResponse = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
          log("Invalid json in access token response")
          return promise.reject(Self.ERR_GENERAL, "Invalid token response")
        }
        if logsEnabled { log("Access token response received") }
        promise.resolve(["access_token_response": tokenResponse])
      } else {
        // No token endpoint: hand back the authorization response itself.
        var out = parameters
        out["access_token"] = credential.oauthToken
        promise.resolve(out)
      }
    case .failure(let error):
      switch error {
      case .cancelled, .accessDenied:
        promise.reject(Self.ERR_USER_CANCELLED, "The user cancelled the login")
      case .stateNotEqual:
        log("The given state does not match the one in the response!")
        promise.reject(Self.ERR_STATES_NOT_MATCH, "State mismatch")
      case .requestError(let underlying, _):
        let (code, message) = Self.oauthError(underlying)
        promise.reject(code ?? Self.ERR_NO_AUTHORIZATION_CODE, message ?? error.localizedDescription)
      default:
        log("Authorization failed with \(error.localizedDescription)")
        promise.reject(Self.ERR_NO_AUTHORIZATION_CODE, error.localizedDescription)
      }
    }
  }

  // MARK: - refreshToken

  private func refreshToken(_ o: Options, _ promise: Promise) {
    guard let appId = o.string("appId") else {
      return promise.reject(Self.ERR_PARAM_NO_APP_ID, "appId is required")
    }
    guard let accessTokenEndpoint = o.string("accessTokenEndpoint") else {
      return promise.reject(Self.ERR_PARAM_NO_ACCESS_TOKEN_ENDPOINT, "accessTokenEndpoint is required")
    }
    guard let refreshToken = o.string("refreshToken") else {
      return promise.reject(Self.ERR_PARAM_NO_REFRESH_TOKEN, "refreshToken is required")
    }

    let oauthSwift = OAuth2Swift(
      consumerKey: appId,
      consumerSecret: "",
      authorizeUrl: "",
      accessTokenUrl: accessTokenEndpoint,
      responseType: "code"
    )
    self.oauthSwift = oauthSwift

    var parameters: OAuthSwift.Parameters = [:]
    if let scope = o.string("scope") { parameters["scope"] = scope }

    oauthSwift.renewAccessToken(withRefreshToken: refreshToken, parameters: parameters) { result in
      switch result {
      case .success(let success):
        guard let data = success.response?.data,
          let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else {
          self.log("Invalid json in renew access token response")
          return promise.reject(Self.ERR_GENERAL, "Invalid token response")
        }
        promise.resolve(json)
      case .failure(let error):
        switch error {
        case .cancelled, .accessDenied:
          promise.reject(Self.ERR_USER_CANCELLED, "The user cancelled the login")
        case .requestError(let underlying, _):
          // e.g. `invalid_grant` when the refresh token expired or was revoked.
          let (code, message) = Self.oauthError(underlying)
          promise.reject(code ?? Self.ERR_GENERAL, message ?? underlying.localizedDescription)
        default:
          self.log("Refresh failed with \(error.localizedDescription)")
          promise.reject(Self.ERR_AUTHORIZATION_FAILED, error.localizedDescription)
        }
      }
    }
  }

  // MARK: - Helpers

  /// The OAuth `error` / `error_description` from a failed token request body.
  private static func oauthError(_ error: Error) -> (String?, String?) {
    let body = (error as NSError).userInfo["Response-Body"] as? String ?? ""
    guard let json = try? JSONSerialization.jsonObject(with: Data(body.utf8)) as? [String: Any] else {
      return (nil, nil)
    }
    return (json["error"] as? String, json["error_description"] as? String ?? json["error"] as? String)
  }

  private static func stringDict(_ params: [String: Any]) -> [String: String] {
    // Only non-empty string values are allowed, as in the plugin.
    params.reduce(into: [:]) { dict, kv in
      if !kv.key.isEmpty, let s = kv.value as? String, !s.isEmpty { dict[kv.key] = s }
    }
  }

  private static func generateRandom(length: Int) -> String {
    let letters = Array("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")
    return String((0..<length).map { _ in letters[Int(arc4random_uniform(UInt32(letters.count)))] })
  }

  private func log(_ msg: String) {
    print("GenericOAuth2: \(msg)")
  }
}

/// Plugin options with the `ios.` overrides the Capacitor plugin supports
/// (`{ appId, ios: { appId } }` → the iOS value wins).
struct Options {
  let raw: [String: Any]
  init(_ raw: [String: Any]) { self.raw = raw }

  func value(_ key: String) -> Any? {
    if let ios = raw["ios"] as? [String: Any], let v = ios[key], !(v is NSNull) { return v }
    let v = raw[key]
    return v is NSNull ? nil : v
  }

  func string(_ key: String) -> String? { value(key) as? String }
}

/// OAuthSwift's ASWebAuthenticationURLHandler re-opens the callback with
/// `UIApplication.open`, counting on the app's openURL handler to pass it to
/// `OAuthSwift.handle(url:)` (the Capacitor plugin does that from its openURL
/// notification). In an Expo app that URL lands in expo-router instead, which shows
/// "Unmatched Route" while the login never completes. This hands the callback, or a
/// cancel/error in the same format OAuthSwift expects, straight to OAuthSwift.
final class WebAuthenticationURLHandler: OAuthSwiftURLHandlerType {
  private let callbackUrlScheme: String
  private let prefersEphemeralWebBrowserSession: Bool
  private weak var presentationContextProvider: ASWebAuthenticationPresentationContextProviding?
  private var session: ASWebAuthenticationSession?

  init(
    callbackUrlScheme: String,
    presentationContextProvider: ASWebAuthenticationPresentationContextProviding?,
    prefersEphemeralWebBrowserSession: Bool
  ) {
    self.callbackUrlScheme = callbackUrlScheme
    self.presentationContextProvider = presentationContextProvider
    self.prefersEphemeralWebBrowserSession = prefersEphemeralWebBrowserSession
  }

  func handle(_ url: URL) {
    let session = ASWebAuthenticationSession(url: url, callbackURLScheme: callbackUrlScheme) {
      [weak self] callback, error in
      guard let self else { return }
      self.session = nil
      if let callback {
        OAuthSwift.handle(url: callback)
      } else {
        let nsError = (error ?? ASWebAuthenticationSessionError(.canceledLogin)) as NSError
        var components = URLComponents()
        components.scheme = self.callbackUrlScheme
        components.queryItems = [
          URLQueryItem(name: "error", value: nsError.localizedDescription),
          URLQueryItem(name: "error_domain", value: nsError.domain),
          URLQueryItem(name: "error_code", value: String(nsError.code)),
        ]
        if let errorURL = components.url { OAuthSwift.handle(url: errorURL) }
      }
    }
    session.presentationContextProvider = presentationContextProvider
    session.prefersEphemeralWebBrowserSession = prefersEphemeralWebBrowserSession
    self.session = session
    session.start()
  }
}

final class PresentationAnchorProvider: NSObject, ASWebAuthenticationPresentationContextProviding {
  private let window: () -> UIWindow?
  init(window: @escaping () -> UIWindow?) { self.window = window }

  func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
    // UIKit's view/window properties are only safe to read on main; reading them
    // elsewhere can return nil and fall back to a blank, unattached UIWindow().
    let read = { self.window() ?? UIApplication.shared.connectedScenes
      .compactMap { ($0 as? UIWindowScene)?.keyWindow }.first ?? UIWindow() }
    return Thread.isMainThread ? read() : DispatchQueue.main.sync(execute: read)
  }
}

// See https://auth0.com/docs/api-auth/tutorials/authorization-code-grant-pkce
extension String {
  fileprivate func sha256() -> Data {
    let data = Data(self.utf8)
    var buffer = [UInt8](repeating: 0, count: Int(CC_SHA256_DIGEST_LENGTH))
    data.withUnsafeBytes { _ = CC_SHA256($0.baseAddress, CC_LONG(data.count), &buffer) }
    return Data(buffer)
  }
}

extension Data {
  fileprivate func base64url() -> String {
    base64EncodedString()
      .replacingOccurrences(of: "+", with: "-")
      .replacingOccurrences(of: "/", with: "_")
      .replacingOccurrences(of: "=", with: "")
  }
}
