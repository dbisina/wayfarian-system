require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json'))) rescue { 'name' => 'activity-controller', 'version' => '1.0.0', 'author' => 'Wayfarian' }

Pod::Spec.new do |s|
  s.name           = 'ActivityController'
  s.version        = '1.0.0'
  s.summary        = 'A local Expo module for managing Live Activities'
  s.description    = 'Handles starting, updating, and stopping implementation of iOS Live Activities'
  s.author         = 'Wayfarian'
  s.homepage       = 'https://github.com/sevenloops/wayfarian-system'
  s.platform       = :ios, '13.0'
  s.source         = { :git => '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,swift}"
end
