Pod::Spec.new do |s|
  s.name           = 'VideoFilters'
  s.version        = '1.0.0'
  s.summary        = 'Native local video filter export for the Expo camera screen'
  s.description    = 'Applies Core Image color effects to locally recorded video.'
  s.license        = { :type => 'MIT' }
  s.author         = 'Local'
  s.homepage       = 'https://expo.dev'
  s.platforms      = { :ios => '16.4' }
  s.source         = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.{h,m,mm,swift}'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
