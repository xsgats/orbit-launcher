




!macro customUnInstall

  IfFileExists "$APPDATA\OrbitLauncher\*.*" 0 skipDataPrompt

    MessageBox MB_YESNO|MB_ICONQUESTION \
      "Remove your Orbit library as well?$\r$\n$\r$\n\
This deletes every instance, world, mod, screenshot, backup and saved account in:$\r$\n\
$APPDATA\OrbitLauncher$\r$\n$\r$\n\
Choose No to keep your library for a future reinstall." \
      /SD IDNO IDNO skipDataPrompt

    RMDir /r "$APPDATA\OrbitLauncher"

  skipDataPrompt:
!macroend

!macro customInstall

  WriteRegStr SHCTX "Software\Classes\orbit" "" "URL:Orbit Launcher"
  WriteRegStr SHCTX "Software\Classes\orbit" "URL Protocol" ""
  WriteRegStr SHCTX "Software\Classes\orbit\DefaultIcon" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr SHCTX "Software\Classes\orbit\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
!macroend

!macro customUnInit

  DeleteRegKey SHCTX "Software\Classes\orbit"
!macroend
