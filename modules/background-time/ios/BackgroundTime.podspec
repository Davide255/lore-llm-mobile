Pod::Spec.new do |s|
  s.name           = 'BackgroundTime'
  s.version        = '1.0.0'
  s.summary        = 'Keeps a piece of work running for a while after the app goes to the background'
  s.description    = 'Wraps UIApplication.beginBackgroundTask / endBackgroundTask for the Expo Modules API.'
  s.author         = ''
  s.homepage       = 'https://lorellm.app'
  s.license        = 'MIT'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = '**/*.{h,m,swift}'
end
