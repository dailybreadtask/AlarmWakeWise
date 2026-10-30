Pod::Spec.new do |s|
  s.name           = 'WakeWiseAlarm'
  s.version        = '1.0.0'
  s.summary        = 'AlarmKit bridge for WakeWise'
  s.description    = 'Schedules system-managed alarms through AlarmKit and ships the bundled wake tones.'
  s.license        = 'UNLICENSED'
  s.author         = 'WakeWise'
  s.homepage       = 'https://developer.apple.com/documentation/alarmkit'
  s.platforms      = {
    :ios => '16.4'
  }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = "**/*.{h,m,swift}"
  # Copied into the app's main bundle, which is where AlarmKit looks up
  # AlertSound.named(_:) files.
  s.resources = "Sounds/*.caf"
  s.weak_frameworks = 'AlarmKit'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
