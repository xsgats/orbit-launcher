; Orbit Launcher — installer customisations
;
; Keeps a user's library (instances, worlds, accounts) safe across
; uninstall/reinstall, and offers a clean removal on request.

!macro customUnInstall
  ; Only ask when there is actually something to delete.
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
  ; Register the orbit:// protocol for one-click modpack links.
  WriteRegStr SHCTX "Software\Classes\orbit" "" "URL:Orbit Launcher"
  WriteRegStr SHCTX "Software\Classes\orbit" "URL Protocol" ""
  WriteRegStr SHCTX "Software\Classes\orbit\DefaultIcon" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr SHCTX "Software\Classes\orbit\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
!macroend

!macro customUnInit
  ; Clean up the protocol registration on the way out.
  DeleteRegKey SHCTX "Software\Classes\orbit"
!macroend
