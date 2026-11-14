// Fails the iOS build when the runtimeVersion baked into the native project (Expo.plist,
// written by `expo prebuild`) differs from app.json. `ios/` is not committed, so archiving
// without re-running prebuild after a runtimeVersion bump ships a binary that downloads
// live updates but never launches them (2.2.0 build 9 shipped with "1" while app.json said "2").
const { IOSConfig, withXcodeProject } = require('expo/config-plugins');

const PHASE_NAME = 'Check expo-updates runtimeVersion';

const script = (projectName) =>
  [
    'set -e',
    `native=$(/usr/libexec/PlistBuddy -c "Print :EXUpdatesRuntimeVersion" "$SRCROOT/${projectName}/Supporting/Expo.plist")`,
    'expected=$(plutil -extract expo.runtimeVersion raw -o - "$SRCROOT/../app.json")',
    'if [ "$native" != "$expected" ]; then',
    '  echo "error: Expo.plist runtimeVersion ($native) differs from app.json ($expected). Run: npx expo prebuild --platform ios"',
    '  exit 1',
    'fi',
  ].join('\n');

module.exports = function withRuntimeVersionCheck(config) {
  return withXcodeProject(config, (config) => {
    const project = config.modResults;
    const projectName = IOSConfig.XcodeUtils.getProjectName(config.modRequest.projectRoot);
    const phases = project.hash.project.objects.PBXShellScriptBuildPhase ?? {};
    const exists = Object.values(phases).some((p) => typeof p === 'object' && p.name === `"${PHASE_NAME}"`);
    if (!exists) {
      const target = project.getFirstTarget().uuid;
      project.addBuildPhase([], 'PBXShellScriptBuildPhase', PHASE_NAME, target, {
        shellPath: '/bin/sh',
        shellScript: script(projectName),
      });
    }
    return config;
  });
};
