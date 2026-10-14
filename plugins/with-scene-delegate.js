// Adopts the UIScene life cycle on iOS. Apps built with the iOS 27 SDK abort at launch
// (_UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption) unless they do, and the
// SDK 57 prebuild template still creates the window in the app delegate. This mirrors the
// SDK 58 template: a SceneDelegate built on Expo's ExpoAppSceneDelegate starts React Native.
// Remove it once the project moves to SDK 58.
const fs = require('fs');
const path = require('path');
const { IOSConfig, withAppDelegate, withDangerousMod, withInfoPlist, withXcodeProject } = require('expo/config-plugins');

const SCENE_DELEGATE = `internal import Expo

@objc(SceneDelegate)
class SceneDelegate: ExpoAppSceneDelegate {
  // Extension point for config plugins.
}
`;

const START_IN_APP_DELEGATE = /\n#if os\(iOS\) \|\| os\(tvOS\)\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\n[\s\S]*?#endif\n/;

function withSceneAppDelegate(config) {
  return withAppDelegate(config, (config) => {
    if (config.modResults.language !== 'swift') {
      throw new Error('with-scene-delegate: expected a Swift AppDelegate');
    }
    let src = config.modResults.contents;
    if (!src.includes('ExpoReactNativeFactoryProvider')) {
      src = src.replace('class AppDelegate: ExpoAppDelegate {', 'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {');
      if (!START_IN_APP_DELEGATE.test(src)) {
        throw new Error('with-scene-delegate: AppDelegate no longer matches the SDK 57 template');
      }
      src = src.replace(
        START_IN_APP_DELEGATE,
        '\n    // The window is created and React Native is started by `SceneDelegate` under the\n' +
          '    // scene-based life cycle (required by the iOS 27 SDK).\n'
      );
    }
    config.modResults.contents = src;
    return config;
  });
}

function withSceneManifest(config) {
  return withInfoPlist(config, (config) => {
    config.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default Configuration',
            UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate',
          },
        ],
      },
    };
    return config;
  });
}

function withSceneDelegateFile(config) {
  config = withDangerousMod(config, [
    'ios',
    (config) => {
      const name = IOSConfig.XcodeUtils.getProjectName(config.modRequest.projectRoot);
      fs.writeFileSync(path.join(config.modRequest.platformProjectRoot, name, 'SceneDelegate.swift'), SCENE_DELEGATE);
      return config;
    },
  ]);
  return withXcodeProject(config, (config) => {
    const name = IOSConfig.XcodeUtils.getProjectName(config.modRequest.projectRoot);
    const filepath = `${name}/SceneDelegate.swift`;
    if (!config.modResults.hasFile(filepath)) {
      IOSConfig.XcodeUtils.addBuildSourceFileToGroup({ filepath, groupName: name, project: config.modResults });
    }
    return config;
  });
}

module.exports = function withSceneDelegate(config) {
  return withSceneDelegateFile(withSceneManifest(withSceneAppDelegate(config)));
};
