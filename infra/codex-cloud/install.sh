#!/usr/bin/env bash
# Build/test setup only. Full application services are configured separately.
set -euo pipefail

REPO="${CLOUD_REPO_DIR:-/workspace/Ai-board-competition}"
TOOLS="${CLOUD_TOOLS_DIR:-$HOME/.local/ai-board-competition}"
MAVEN_VERSION=3.9.9
PNPM_VERSION=11.25.0
cd "$REPO"
umask 077
mkdir -p "$TOOLS/opt" "$TOOLS/downloads" "$TOOLS/config" "$HOME/.local/share/maven/repository"
for tool in curl python3 tar node npm; do
  command -v "$tool" >/dev/null || { echo "Missing required tool: $tool" >&2; exit 1; }
done

download() {
  curl --fail --location --silent --show-error --retry 2 --connect-timeout 20 --max-time 300 "$1" --output "$2"
}

# Pin the major JDK and explicitly select both java and javac. Do not rely on
# different JAVA_HOME/PATH defaults inherited by Maven or its launcher rc files.
export JAVA_HOME="$TOOLS/opt/jdk-17"
if [[ ! -x "$JAVA_HOME/bin/javac" ]]; then
  case "$(uname -m)" in
    x86_64) jdk_arch=x64 ;;
    aarch64|arm64) jdk_arch=aarch64 ;;
    *) echo "Unsupported JDK architecture" >&2; exit 1 ;;
  esac
  metadata="$TOOLS/downloads/jdk-17.json"
  download "https://api.adoptium.net/v3/assets/latest/17/hotspot?architecture=$jdk_arch&image_type=jdk&os=linux&vendor=eclipse" "$metadata"
  python3 - "$metadata" "$TOOLS/downloads" <<'PY'
import json, pathlib, sys
package = json.loads(pathlib.Path(sys.argv[1]).read_text())[0]['binary']['package']
url = package['link']
if not url.startswith('https://github.com/adoptium/temurin17-binaries/releases/download/'):
    raise SystemExit('Unexpected JDK package host/path')
destination = pathlib.Path(sys.argv[2])
(destination / 'jdk-17.url').write_text(url)
(destination / 'jdk-17.sha256').write_text(package['checksum'])
PY
  download "$(cat "$TOOLS/downloads/jdk-17.url")" "$TOOLS/downloads/jdk-17.tar.gz"
  python3 - "$TOOLS/downloads/jdk-17.tar.gz" "$TOOLS/downloads/jdk-17.sha256" <<'PY'
import hashlib, pathlib, sys
actual = hashlib.sha256(pathlib.Path(sys.argv[1]).read_bytes()).hexdigest()
if actual != pathlib.Path(sys.argv[2]).read_text().strip():
    raise SystemExit('JDK checksum mismatch')
PY
  temporary_jdk="$(mktemp -d "$TOOLS/opt/jdk-17.XXXXXX")"
  tar -xzf "$TOOLS/downloads/jdk-17.tar.gz" -C "$temporary_jdk" --strip-components=1
  mv "$temporary_jdk" "$JAVA_HOME"
fi
"$JAVA_HOME/bin/javac" -version 2>&1 | grep -q '^javac 17\.' || { echo 'Expected a JDK 17 compiler' >&2; exit 1; }
export PATH="$JAVA_HOME/bin:$PATH"
export MAVEN_SKIP_RC=true

MAVEN_HOME="$TOOLS/opt/apache-maven-$MAVEN_VERSION"
if [[ ! -x "$MAVEN_HOME/bin/mvn" ]]; then
  maven_url="https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/$MAVEN_VERSION/apache-maven-$MAVEN_VERSION-bin.tar.gz"
  download "$maven_url" "$TOOLS/downloads/maven.tar.gz"
  download "$maven_url.sha512" "$TOOLS/downloads/maven.sha512"
  python3 - "$TOOLS/downloads/maven.tar.gz" "$TOOLS/downloads/maven.sha512" <<'PY'
import hashlib, pathlib, sys
actual = hashlib.sha512(pathlib.Path(sys.argv[1]).read_bytes()).hexdigest()
expected = pathlib.Path(sys.argv[2]).read_text().split()[0].lower()
if actual != expected:
    raise SystemExit('Maven checksum mismatch')
PY
  tar -xzf "$TOOLS/downloads/maven.tar.gz" -C "$TOOLS/opt"
fi

# Maven does not automatically consume HTTP_PROXY/HTTPS_PROXY. Keep credentials
# (if the platform supplies any) in private user configuration, never source.
SETTINGS="$TOOLS/config/maven-settings.xml"
python3 - "$SETTINGS" <<'PY'
import os, pathlib, sys, urllib.parse, xml.etree.ElementTree as ET
namespace = 'http://maven.apache.org/SETTINGS/1.0.0'
ET.register_namespace('', namespace)
def element(parent, name, value=None):
    child = ET.SubElement(parent, '{%s}%s' % (namespace, name))
    if value is not None:
        child.text = str(value)
    return child
root = ET.Element('{%s}settings' % namespace)
raw = next((os.environ[key] for key in ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy'] if os.environ.get(key)), '')
if raw:
    proxy = urllib.parse.urlsplit(raw)
    if proxy.scheme != 'http' or not proxy.hostname:
        raise SystemExit('Configure a supported HTTP CONNECT proxy before continuing')
    entry = element(element(root, 'proxies'), 'proxy')
    for name, value in [('id', 'codex-cloud'), ('active', 'true'), ('protocol', 'http'),
                        ('host', proxy.hostname), ('port', proxy.port or 80),
                        ('nonProxyHosts', 'localhost|127.0.0.1')]:
        element(entry, name, value)
    if proxy.username:
        element(entry, 'username', urllib.parse.unquote(proxy.username))
    if proxy.password:
        element(entry, 'password', urllib.parse.unquote(proxy.password))
path = pathlib.Path(sys.argv[1])
ET.ElementTree(root).write(path, encoding='utf-8', xml_declaration=True)
path.chmod(0o600)
PY

PNPM_JS="$TOOLS/opt/pnpm/node_modules/pnpm/bin/pnpm.cjs"
if [[ ! -f "$PNPM_JS" ]]; then
  npm install --prefix "$TOOLS/opt/pnpm" --no-audit --no-fund "pnpm@$PNPM_VERSION"
fi
node "$PNPM_JS" --version
"$MAVEN_HOME/bin/mvn" -version

for frontend in frontend frontend-admin; do
  (
    cd "$REPO/$frontend"
    node "$PNPM_JS" install --frozen-lockfile
    # Direct entry points avoid pnpm runtime re-synchronization after installation.
    node node_modules/vitest/vitest.mjs run
    node node_modules/typescript/bin/tsc -b --noEmit
    node node_modules/typescript/bin/tsc -b
    node node_modules/vite/bin/vite.js build
  )
done

"$MAVEN_HOME/bin/mvn" -B -ntp -s "$SETTINGS" \
  -Dmaven.repo.local="$HOME/.local/share/maven/repository" \
  -Dmaven.compiler.fork=false -Dmaven.compiler.release=17 \
  -f "$REPO/backend/pom.xml" '-Dtest=*Test' package

git diff --exit-code -- backend/pom.xml frontend/pnpm-lock.yaml frontend-admin/pnpm-lock.yaml
printf '%s\n' 'Build/test setup passed. Database, Redis, RabbitMQ and full application startup require separate verified configuration.'
