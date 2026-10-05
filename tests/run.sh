#!/usr/bin/env bash
# Runs the rules tests; failures are also printed as GitHub annotations.
node --test --test-reporter=spec tests/ > test-out.txt 2>&1; s=$?
cat test-out.txt
if [ $s -ne 0 ]; then grep -E "✖|not ok|Error|expected|FirebaseError" test-out.txt | head -25 | while IFS= read -r l; do echo "::error::$l"; done; fi
exit $s
