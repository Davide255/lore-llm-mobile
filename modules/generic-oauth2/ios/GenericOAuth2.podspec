Pod::Spec.new do |s|
  s.name           = 'GenericOAuth2'
  s.version        = '7.0.0'
  s.summary        = 'Expo port of the generic-oauth2 Capacitor plugin (iOS)'
  s.description    = 'OAuth 2 authorization code (+PKCE) and refresh flows via ASWebAuthenticationSession and OAuthSwift.'
  s.author         = ''
  s.homepage       = 'https://github.com/Davide255/generic-oauth2'
  s.license        = 'MIT'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: 'https://github.com/Davide255/generic-oauth2.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.dependency 'OAuthSwift', '2.2.0'

  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = '**/*.{h,m,swift}'
end
