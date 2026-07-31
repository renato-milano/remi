import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const pexec = promisify(execFile);

/** Elemento UI cliccabile individuato via API di accessibilità (coordinate schermo). */
export interface UiElement {
  role: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Enumera gli elementi cliccabili della finestra in primo piano tramite l'API
 * di accessibilità del sistema (set-of-marks). Cross-platform: macOS (System
 * Events), Windows (UIAutomation via PowerShell). Restituisce [] se non
 * disponibile (es. Linux, o app senza albero AX ricco come alcune Electron).
 */
export async function inspectUi(): Promise<UiElement[]> {
  try {
    if (process.platform === 'darwin') return await inspectMac();
    if (process.platform === 'win32') return await inspectWindows();
    return [];
  } catch {
    return [];
  }
}

function parseRows(stdout: string): UiElement[] {
  const out: UiElement[] = [];
  for (const line of stdout.split('\n')) {
    const p = line.split('\t');
    if (p.length < 6) continue;
    const x = Number(p[2]);
    const y = Number(p[3]);
    const w = Number(p[4]);
    const h = Number(p[5]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || w <= 0 || h <= 0) continue;
    out.push({ role: cleanRole(p[0]), name: (p[1] ?? '').trim().slice(0, 80), x, y, w, h });
  }
  return out;
}

function cleanRole(r: string): string {
  return r.replace(/^AX/, '').replace(/^ControlType\./, '');
}

const MAC_SCRIPT = `tell application "System Events"
  set frontApp to first process whose frontmost is true
  tell frontApp
    set out to ""
    try
      set els to entire contents of window 1
    on error
      return ""
    end try
    set n to 0
    repeat with e in els
      if n > 60 then exit repeat
      try
        set r to role of e
        if r is in {"AXButton", "AXTextField", "AXSearchField", "AXTextArea", "AXComboBox", "AXPopUpButton", "AXCheckBox", "AXLink", "AXMenuButton"} then
          set nm to ""
          try
            set nm to description of e
          end try
          if nm is missing value or nm is "" then
            try
              set nm to title of e
            end try
          end if
          if nm is missing value then set nm to ""
          set p to position of e
          set s to size of e
          set out to out & r & tab & nm & tab & (item 1 of p) & tab & (item 2 of p) & tab & (item 1 of s) & tab & (item 2 of s) & linefeed
          set n to n + 1
        end if
      end try
    end repeat
    return out
  end tell
end tell`;

async function inspectMac(): Promise<UiElement[]> {
  const { stdout } = await pexec('osascript', ['-e', MAC_SCRIPT], {
    timeout: 6000,
    maxBuffer: 4 * 1024 * 1024,
  });
  return parseRows(stdout);
}

const WIN_SCRIPT = `Add-Type -AssemblyName UIAutomationClient,UIAutomationTypes | Out-Null
$AE = [System.Windows.Automation.AutomationElement]
$walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
$el = $AE::FocusedElement
if ($el -eq $null) { exit }
$win = $el
while ($win -ne $null -and $win.Current.ControlType.ProgrammaticName -ne 'ControlType.Window') {
  $p = $walker.GetParent($win); if ($p -eq $null) { break }; $win = $p
}
if ($win -eq $null) { exit }
$cond = [System.Windows.Automation.Condition]::TrueCondition
$els = $win.FindAll([System.Windows.Automation.TreeScope]::Descendants, $cond)
$count = 0
foreach ($e in $els) {
  if ($count -ge 60) { break }
  $ct = $e.Current.ControlType.ProgrammaticName
  if ($ct -match 'Button|Edit|Hyperlink|CheckBox|ComboBox|RadioButton|MenuItem|Tab') {
    $r = $e.Current.BoundingRectangle
    if ($r.Width -gt 0 -and $r.Height -gt 0) {
      $nm = $e.Current.Name
      [Console]::WriteLine("$ct\`t$nm\`t$([int]$r.X)\`t$([int]$r.Y)\`t$([int]$r.Width)\`t$([int]$r.Height)")
      $count++
    }
  }
}`;

async function inspectWindows(): Promise<UiElement[]> {
  const { stdout } = await pexec(
    'powershell',
    ['-NoProfile', '-NonInteractive', '-Command', WIN_SCRIPT],
    { timeout: 8000, maxBuffer: 4 * 1024 * 1024 },
  );
  return parseRows(stdout);
}
