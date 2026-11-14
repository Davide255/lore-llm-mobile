import ExpoModulesCore
import UIKit

/// Asks iOS for extra time when the app leaves the foreground, so a stream in
/// progress (question generation, grading) can finish instead of being frozen.
/// iOS grants about 30 seconds; when it runs out the task is ended here and
/// `onExpire` tells JS, which then resumes the work on return.
public class BackgroundTimeModule: Module {
  private var tasks: [String: UIBackgroundTaskIdentifier] = [:]

  public func definition() -> ModuleDefinition {
    Name("BackgroundTime")

    Events("onExpire")

    Function("begin") { (key: String) in
      DispatchQueue.main.async { self.begin(key) }
    }

    Function("end") { (key: String) in
      DispatchQueue.main.async { self.end(key) }
    }
  }

  private func begin(_ key: String) {
    guard tasks[key] == nil else { return }
    let id = UIApplication.shared.beginBackgroundTask(withName: key) { [weak self] in
      self?.sendEvent("onExpire", ["key": key])
      self?.end(key)
    }
    if id != .invalid { tasks[key] = id }
  }

  private func end(_ key: String) {
    guard let id = tasks.removeValue(forKey: key) else { return }
    UIApplication.shared.endBackgroundTask(id)
  }
}
