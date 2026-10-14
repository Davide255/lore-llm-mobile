import ExpoModulesCore
import OAuthSwift

/// The Capacitor plugin's openURL observer, ported: if iOS also delivers the OAuth
/// redirect to the app (rather than only to the ASWebAuthenticationSession), it still
/// reaches the pending OAuthSwift authorization. Harmless when none is pending.
public class GenericOAuth2AppDelegateSubscriber: ExpoAppDelegateSubscriber {
  public func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
    if items.contains(where: { $0.name == "state" || $0.name == "error" }) {
      NSLog("GenericOAuth2: callback via openURL")
      OAuthSwift.handle(url: url)
    }
    return false
  }
}
