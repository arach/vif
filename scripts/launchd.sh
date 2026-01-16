#!/bin/bash
# Manage vif server as a Launch Agent

PLIST_NAME="com.vif.server.plist"
PLIST_SRC="$(dirname "$0")/$PLIST_NAME"
PLIST_DST="$HOME/Library/LaunchAgents/$PLIST_NAME"

case "$1" in
  install)
    echo "Installing vif server launch agent..."
    cp "$PLIST_SRC" "$PLIST_DST"
    launchctl load "$PLIST_DST"
    echo "Done. Server will start now and on login."
    echo "Logs: /tmp/vif-server.log"
    ;;

  uninstall)
    echo "Uninstalling vif server launch agent..."
    launchctl unload "$PLIST_DST" 2>/dev/null
    rm -f "$PLIST_DST"
    echo "Done."
    ;;

  start)
    launchctl start com.vif.server
    echo "Started."
    ;;

  stop)
    launchctl stop com.vif.server
    echo "Stopped."
    ;;

  restart)
    launchctl stop com.vif.server
    sleep 1
    launchctl start com.vif.server
    echo "Restarted."
    ;;

  status)
    if launchctl list | grep -q com.vif.server; then
      echo "Running"
      launchctl list com.vif.server
    else
      echo "Not running"
    fi
    ;;

  logs)
    tail -f /tmp/vif-server.log
    ;;

  *)
    echo "Usage: $0 {install|uninstall|start|stop|restart|status|logs}"
    exit 1
    ;;
esac
