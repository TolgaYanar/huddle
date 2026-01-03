@echo off
setlocal

set DIR=%~dp0

REM Prefer JDK 17 for Android Gradle Plugin compatibility.
for /d %%D in ("%USERPROFILE%\.jdk\jdk-17*") do (
  if exist "%%D\bin\java.exe" (
    set JAVA_EXE="%%D\bin\java.exe"
    goto run
  )
)

if defined JAVA_HOME (
  if exist "%JAVA_HOME%\bin\java.exe" (
    set JAVA_EXE="%JAVA_HOME%\bin\java.exe"
  )
)

if not defined JAVA_EXE (
  set JAVA_EXE=java
)

:run

%JAVA_EXE% -classpath "%DIR%gradle\wrapper\gradle-wrapper.jar" org.gradle.wrapper.GradleWrapperMain %*

endlocal
