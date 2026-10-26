import { execFileSync } from 'node:child_process';
import { mkdir, access } from 'node:fs/promises';
import path from 'node:path';

if (process.platform !== 'win32') throw Error('Build the native Windows helper on Windows with MSVC Build Tools.');
const root = process.cwd();
const vswhere = path.join(process.env['ProgramFiles(x86)'] || 'C:/Program Files (x86)', 'Microsoft Visual Studio/Installer/vswhere.exe');
const vs = execFileSync(vswhere, ['-latest','-products','*','-requires','Microsoft.VisualStudio.Component.VC.Tools.x86.x64','-property','installationPath'], {encoding:'utf8',windowsHide:true}).trim();
if (!vs) throw Error('Install the Visual Studio Desktop development with C++ workload.');
const vcvars = path.join(vs,'VC/Auxiliary/Build/vcvars64.bat');
await access(vcvars);
await mkdir('native/build', {recursive:true});
const quote = value => `"${value}"`;
// Only fixed source/output names enter cmd.exe; no settings or user input.
const command = `call ${quote(vcvars)} >nul && cl /nologo /O1 /W4 /WX /MT /DUNICODE /D_UNICODE native\\hotkey.c /Fo:native\\build\\hotkey.obj /Fe:native\\build\\glimmer-memo-hotkey.exe user32.lib shell32.lib /link /SUBSYSTEM:WINDOWS /DYNAMICBASE /NXCOMPAT /OPT:REF /OPT:ICF`;
execFileSync(process.env.ComSpec || 'cmd.exe', ['/d','/s','/c',`"${command}"`], {cwd:root,stdio:'inherit',windowsHide:true,windowsVerbatimArguments:true});
