#!/bin/bash
echo "=== Checking plugin installation ==="
echo ""
echo "Expected location: ~/.signalk/node_modules/signalk-logviewer/"
echo ""
if [ -d ~/.signalk/node_modules/signalk-logviewer ]; then
  echo "✓ Plugin directory exists"
  echo ""
  echo "Files in plugin directory:"
  ls -lh ~/.signalk/node_modules/signalk-logviewer/
  echo ""
  echo "Checking critical files:"
  [ -f ~/.signalk/node_modules/signalk-logviewer/plugin.wasm ] && echo "  ✓ plugin.wasm" || echo "  ✗ plugin.wasm MISSING"
  [ -f ~/.signalk/node_modules/signalk-logviewer/package.json ] && echo "  ✓ package.json" || echo "  ✗ package.json MISSING"
  [ -d ~/.signalk/node_modules/signalk-logviewer/public ] && echo "  ✓ public/ directory" || echo "  ✗ public/ directory MISSING"
else
  echo "✗ Plugin directory NOT FOUND"
  echo ""
  echo "Please install with:"
  echo "  mkdir -p ~/.signalk/node_modules/signalk-logviewer"
  echo "  cp plugin.wasm package.json ~/.signalk/node_modules/signalk-logviewer/"
  echo "  cp -r public ~/.signalk/node_modules/signalk-logviewer/"
fi
