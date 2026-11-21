'use strict';
// magpie on a Mac: starting at login, its apps, and the key combo.
//
// The key combo is a macOS "service" (a small Automator workflow in
// ~/Library/Services) with a keyboard shortcut. That's the one way to get a
// key combo that works in every app without an administrator or any
// permissions: macOS runs it, and it asks magpie to show the picker.

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { home } = require('./store');
const Mac = require('./macos')({ app: 'magpie', label: 'dev.dpatel7.magpie', home });

const SCRIPT = path.join(__dirname, '..', 'bin', 'magpie.js');
const SERVICE = 'Magpie: pick something you copied';
const workflowDir = () => path.join(os.homedir(), 'Library', 'Services', 'Magpie.workflow');
const x = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** "ctrl+option+v" / "^~v" / "⌃⌥V" → { equiv: '^~v', label: '⌃⌥V' } */
function keyCombo(input) {
  let s = String(input || '').trim();
  if (!s) throw new Error('Say a key combo, like ctrl+option+v');
  const mods = { '^': false, '~': false, '$': false, '@': false };
  const words = { ctrl: '^', control: '^', '⌃': '^', opt: '~', option: '~', alt: '~', '⌥': '~', shift: '$', '⇧': '$', cmd: '@', command: '@', '⌘': '@' };
  let key = '';
  if (/^[\^~$@]+[a-z0-9]$/i.test(s)) {
    for (const c of s.slice(0, -1)) mods[c] = true;
    key = s.slice(-1).toLowerCase();
  } else {
    s = s.replace(/[⌃⌥⇧⌘]/g, (c) => `${c}+`);
    for (const part of s.toLowerCase().split(/[+\s-]+/).filter(Boolean)) {
      if (words[part]) mods[words[part]] = true;
      else if (/^[a-z0-9]$/.test(part)) key = part;
      else throw new Error(`"${part}" isn't a key magpie knows. Use letters or numbers with ctrl, option, shift, cmd.`);
    }
  }
  if (!key) throw new Error('Which letter? Like ctrl+option+v');
  if (!mods['^'] && !mods['~'] && !mods['@']) throw new Error('Use ctrl, option or cmd too, so it never gets in the way of typing.');
  const equiv = ['^', '~', '$', '@'].filter((m) => mods[m]).join('') + key;
  const label = ['^', '~', '$', '@'].filter((m) => mods[m]).map((m) => ({ '^': '⌃', '~': '⌥', $: '⇧', '@': '⌘' }[m])).join('') + key.toUpperCase();
  return { equiv, label };
}

function uuid() { return crypto.randomUUID().toUpperCase(); }

/** The Automator workflow that becomes the service. Its one step runs `magpie pick`. */
function workflowFiles(node = process.execPath, script = SCRIPT) {
  const q = (v) => `'${String(v).replace(/'/g, `'\\''`)}'`;
  const command = `export LC_ALL=en_US.UTF-8 LANG=en_US.UTF-8\n${q(node)} ${q(script)} pick >/dev/null 2>&1 &\n`;
  const arg = (i, name, def, type) => `<key>${i}</key><dict><key>default value</key>${def}<key>name</key><string>${name}</string><key>required</key><string>0</string><key>type</key><string>${type}</string><key>uuid</key><string>${i}</string></dict>`;
  const info = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>NSServices</key>
	<array>
		<dict>
			<key>NSBackgroundColorName</key>
			<string>background</string>
			<key>NSIconName</key>
			<string>NSActionTemplate</string>
			<key>NSMenuItem</key>
			<dict>
				<key>default</key>
				<string>${x(SERVICE)}</string>
			</dict>
			<key>NSMessage</key>
			<string>runWorkflowAsService</string>
		</dict>
	</array>
</dict>
</plist>
`;
  const wflow = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>AMApplicationBuild</key>
	<string>523</string>
	<key>AMApplicationVersion</key>
	<string>2.10</string>
	<key>AMDocumentVersion</key>
	<string>2</string>
	<key>actions</key>
	<array>
		<dict>
			<key>action</key>
			<dict>
				<key>AMAccepts</key>
				<dict><key>Container</key><string>List</string><key>Optional</key><true/><key>Types</key><array><string>com.apple.cocoa.string</string></array></dict>
				<key>AMActionVersion</key>
				<string>2.0.3</string>
				<key>AMApplication</key>
				<array><string>Automator</string></array>
				<key>AMParameterProperties</key>
				<dict><key>COMMAND_STRING</key><dict/><key>CheckedForUserDefaultShell</key><dict/><key>inputMethod</key><dict/><key>shell</key><dict/><key>source</key><dict/></dict>
				<key>AMProvides</key>
				<dict><key>Container</key><string>List</string><key>Types</key><array><string>com.apple.cocoa.string</string></array></dict>
				<key>ActionBundlePath</key>
				<string>/System/Library/Automator/Run Shell Script.action</string>
				<key>ActionName</key>
				<string>Run Shell Script</string>
				<key>ActionParameters</key>
				<dict>
					<key>COMMAND_STRING</key>
					<string>${x(command)}</string>
					<key>CheckedForUserDefaultShell</key>
					<true/>
					<key>inputMethod</key>
					<integer>0</integer>
					<key>shell</key>
					<string>/bin/sh</string>
					<key>source</key>
					<string></string>
				</dict>
				<key>BundleIdentifier</key>
				<string>com.apple.RunShellScript</string>
				<key>CFBundleVersion</key>
				<string>2.0.3</string>
				<key>CanShowSelectedItemsWhenRun</key>
				<false/>
				<key>CanShowWhenRun</key>
				<true/>
				<key>Category</key>
				<array><string>AMCategoryUtilities</string></array>
				<key>Class Name</key>
				<string>RunShellScriptAction</string>
				<key>InputUUID</key>
				<string>${uuid()}</string>
				<key>Keywords</key>
				<array><string>Shell</string><string>Script</string><string>Command</string><string>Run</string><string>Unix</string></array>
				<key>OutputUUID</key>
				<string>${uuid()}</string>
				<key>UUID</key>
				<string>${uuid()}</string>
				<key>UnlocalizedApplications</key>
				<array><string>Automator</string></array>
				<key>arguments</key>
				<dict>${arg(0, 'inputMethod', '<integer>0</integer>', '0')}${arg(1, 'source', '<string></string>', '0')}${arg(2, 'CheckedForUserDefaultShell', '<false/>', '0')}${arg(3, 'COMMAND_STRING', '<string></string>', '0')}${arg(4, 'shell', '<string></string>', '0')}</dict>
				<key>isViewVisible</key>
				<integer>1</integer>
				<key>location</key>
				<string>309.000000:253.000000</string>
				<key>nibPath</key>
				<string>/System/Library/Automator/Run Shell Script.action/Contents/Resources/Base.lproj/main.nib</string>
			</dict>
			<key>isViewVisible</key>
			<integer>1</integer>
		</dict>
	</array>
	<key>connectors</key>
	<dict/>
	<key>workflowMetaData</key>
	<dict>
		<key>applicationBundleIDsByPath</key>
		<dict/>
		<key>applicationPaths</key>
		<array/>
		<key>inputTypeIdentifier</key>
		<string>com.apple.Automator.nothing</string>
		<key>outputTypeIdentifier</key>
		<string>com.apple.Automator.nothing</string>
		<key>presentationMode</key>
		<integer>11</integer>
		<key>processesInput</key>
		<integer>0</integer>
		<key>serviceInputTypeIdentifier</key>
		<string>com.apple.Automator.nothing</string>
		<key>serviceOutputTypeIdentifier</key>
		<string>com.apple.Automator.nothing</string>
		<key>serviceProcessesInput</key>
		<integer>0</integer>
		<key>systemImageName</key>
		<string>NSActionTemplate</string>
		<key>useAutomaticInputType</key>
		<integer>0</integer>
		<key>workflowTypeIdentifier</key>
		<string>com.apple.Automator.servicesMenu</string>
	</dict>
</dict>
</plist>
`;
  return { info, wflow };
}

/** Make the service and give it the key combo. Returns { ok, label, why }. */
function setKey(combo) {
  const k = keyCombo(combo);
  if (!Mac.MAC) return { ok: false, label: k.label, why: 'Key combos are for Macs.' };
  const dir = workflowDir();
  const f = workflowFiles();
  fs.mkdirSync(path.join(dir, 'Contents'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'Contents', 'Info.plist'), f.info);
  fs.writeFileSync(path.join(dir, 'Contents', 'document.wflow'), f.wflow);
  // the shortcut: the same setting System Settings › Keyboard › Keyboard Shortcuts › Services writes
  const id = `(null) - ${SERVICE} - runWorkflowAsService`;
  const r = Mac.run('defaults', ['write', 'pbs', 'NSServicesStatus', '-dict-add', `"${id}"`,
    `{ "key_equivalent" = "${k.equiv}"; "enabled_context_menu" = 1; "enabled_services_menu" = 1; "presentation_modes" = { ContextMenu = 1; ServicesMenu = 1; TouchBar = 1; }; }`]);
  Mac.run('/System/Library/CoreServices/pbs', ['-flush']);
  Mac.run('/System/Library/CoreServices/pbs', ['-update']);
  return { ok: r.ok, label: k.label, why: r.ok ? '' : r.err };
}

function removeKey() {
  fs.rmSync(workflowDir(), { recursive: true, force: true });
  if (Mac.MAC) {
    Mac.run('defaults', ['delete', 'pbs', 'NSServicesStatus', `(null) - ${SERVICE} - runWorkflowAsService`]);
    Mac.run('/System/Library/CoreServices/pbs', ['-flush']);
  }
}

/** The main screen's size, in points. */
function screen() {
  if (!Mac.MAC) return null;
  const r = Mac.jxa("ObjC.import('AppKit'); var f = $.NSScreen.mainScreen.frame; JSON.stringify({ w: f.size.width, h: f.size.height })", [], 5000);
  try { return JSON.parse(r.out); } catch { return null; }
}

/** Start magpie at login (watching the clipboard), and make its two apps. */
function setUp(version) {
  const icon = path.join(__dirname, '..', 'assets', 'magpie.icns');
  Mac.makeApp({ name: 'Magpie', id: 'dev.dpatel7.magpie.app', args: ['app'], icon, script: SCRIPT, version });
  Mac.makeApp({ name: 'Magpie Picker', id: 'dev.dpatel7.magpie.picker', args: ['pick'], icon, script: SCRIPT, version });
  return Mac.startAgent({ args: ['serve'], script: SCRIPT });
}

function tearDown() {
  Mac.stopAgent();
  Mac.removeApp('Magpie');
  Mac.removeApp('Magpie Picker');
  removeKey();
}

module.exports = { ...Mac, screen, keyCombo, workflowFiles, setKey, removeKey, setUp, tearDown, SERVICE, SCRIPT, workflowDir };
