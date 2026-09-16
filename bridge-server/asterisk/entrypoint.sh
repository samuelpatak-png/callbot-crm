#!/bin/sh
set -e

replace() {
  # Avoid sed: SIP password can contain regex-special characters.
  python3 -c '
import os, pathlib, sys
src, dest = sys.argv[1], sys.argv[2]
text = pathlib.Path(src).read_text()
for key in ("ZADARMA_SIP_NUMBER", "ZADARMA_SIP_PASSWORD", "ARI_USER", "ARI_PASSWORD"):
    text = text.replace("${" + key + "}", os.environ.get(key, ""))
pathlib.Path(dest).write_text(text)
' "$1" "$2"
}

replace /templates/pjsip.conf.template /etc/asterisk/pjsip.conf
replace /templates/ari.conf.template /etc/asterisk/ari.conf
exec asterisk -f -vvv
