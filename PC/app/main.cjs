const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawn, execFile } = require('node:child_process');

let win = null;
let vm = null;

const webPath = app.isPackaged
  ? path.join(process.resourcesPath, 'web')
  : path.resolve(__dirname, '../web');
const userDir = () => path.join(app.getPath('userData'), 'virtual-machines');
const portableQemuBin = () => path.join(os.homedir(), 'Applications', 'NovaPC', 'qemu-portable', 'bin');

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 850,
    minWidth: 760,
    minHeight: 600,
    backgroundColor: '#090d16',
    title: 'Nova PC',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  win.loadFile(path.join(webPath, 'index.html'));
  win.on('closed', () => { win = null; });
}

function findExecutable(names) {
  const candidates = [];
  for (const name of names) {
    if (path.isAbsolute(name)) candidates.push(name);
    else {
      candidates.push(path.join(portableQemuBin(), name));
      for (const dir of (process.env.PATH || '').split(path.delimiter)) {
        if (dir) candidates.push(path.join(dir, name));
      }
      if (process.platform === 'win32') {
        candidates.push(path.join(portableQemuBin(), name + '.exe'));
        for (const dir of (process.env.PATH || '').split(path.delimiter)) {
          if (dir) candidates.push(path.join(dir, name + '.exe'));
        }
      }
    }
  }
  return candidates.find(p => {
    try { return fs.statSync(p).isFile(); } catch { return false; }
  }) || null;
}

function qemuPaths() {
  if (process.platform === 'win32') return ['qemu-system-x86_64.exe', 'qemu-system-x86_64'];
  if (process.platform === 'darwin' && process.arch === 'arm64') {
    return ['qemu-system-aarch64', 'qemu-system-x86_64'];
  }
  return ['qemu-system-x86_64'];
}
function qemuImgPaths() {
  return process.platform === 'win32' ? ['qemu-img.exe', 'qemu-img'] : ['qemu-img'];
}
function isArmQemu(qemu) {
  return path.basename(qemu).includes('aarch64');
}
function findArmFirmware(qemu) {
  const qemuRoot = path.dirname(path.dirname(qemu));
  const candidates = [
    path.join(qemuRoot, 'share', 'qemu', 'edk2-aarch64-code.fd'),
    path.join(qemuRoot, 'share', 'qemu', 'edk2-aarch64-code.fd'),
    path.join(qemuRoot, 'share', 'edk2-aarch64-code.fd'),
    '/opt/homebrew/share/qemu/edk2-aarch64-code.fd'
  ];
  return candidates.find(p => fs.existsSync(p)) || null;
}
function runFile(file, args) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { windowsHide: true, timeout: 15000 }, (err, stdout, stderr) => {
      if (err) reject(new Error((stderr || err.message).trim()));
      else resolve({ stdout, stderr });
    });
  });
}

ipcMain.handle('host-info', () => {
  const qemu = findExecutable(qemuPaths());
  const qemuImg = findExecutable(qemuImgPaths());
  return {
    cpu: os.cpus().length,
    ram: Math.floor(os.totalmem() / 1024 ** 3),
    platform: process.platform,
    qemu: !!qemu,
    qemuImg: !!qemuImg,
    qemuArchitecture: qemu && isArmQemu(qemu) ? 'aarch64' : 'x86_64'
  };
});

ipcMain.handle('choose-iso', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Choose OS installation ISO',
    properties: ['openFile'],
    filters: [{ name: 'ISO images', extensions: ['iso'] }, { name: 'All files', extensions: ['*'] }]
  });
  if (r.canceled || !r.filePaths[0]) return null;
  return { name: path.basename(r.filePaths[0]), path: r.filePaths[0] };
});

ipcMain.handle('start-vm', async (_event, config) => {
  if (vm && !vm.killed) throw new Error('A Nova PC virtual machine is already running.');
  const qemu = findExecutable(qemuPaths());
  if (!qemu) {
    throw new Error('QEMU was not found. On Apple Silicon, place qemu-system-aarch64 and its libraries in ~/Applications/NovaPC/qemu-portable/bin.');
  }
  if (!config || typeof config.isoPath !== 'string' ||
      !fs.existsSync(config.isoPath) || path.extname(config.isoPath).toLowerCase() !== '.iso') {
    throw new Error('Select a valid ISO image.');
  }

  const cpu = Math.max(1, Math.min(32, Math.floor(Number(config.cpu) || 2)));
  const ram = Math.max(1, Math.min(64, Math.floor(Number(config.ram) || 4)));
  const disk = Math.max(16, Math.min(512, Math.floor(Number(config.disk) || 32)));
  fs.mkdirSync(userDir(), { recursive: true });
  const diskPath = path.join(userDir(), 'nova-guest.qcow2');
  const qimg = findExecutable(qemuImgPaths());

  if (!fs.existsSync(diskPath)) {
    if (!qimg) throw new Error('qemu-img was not found. Ensure it is in the portable QEMU bin folder.');
    await runFile(qimg, ['create', '-f', 'qcow2', diskPath, disk + 'G']);
  }

  const armGuest = isArmQemu(qemu);
  let args;
  if (armGuest) {
    args = [
      '-machine', 'virt',
      '-cpu', 'max',
      '-smp', String(cpu),
      '-m', String(ram * 1024),
      '-drive', 'if=none,id=systemdisk,format=qcow2,file=' + diskPath,
      '-device', 'virtio-blk-device,drive=systemdisk',
      '-drive', 'if=none,id=installer,media=cdrom,readonly=on,file=' + config.isoPath,
      '-device', 'virtio-scsi-device',
      '-device', 'scsi-cd,drive=installer',
      '-boot', 'order=d',
      '-nic', 'user,model=virtio-net-pci',
      '-accel', 'tcg'
    ];
    const firmware = findArmFirmware(qemu);
    if (firmware) args.push('-bios', firmware);
  } else {
    args = [
      '-machine', 'q35',
      '-smp', String(cpu),
      '-m', String(ram * 1024),
      '-drive', 'file=' + diskPath + ',format=qcow2,if=virtio',
      '-cdrom', config.isoPath,
      '-boot', 'd',
      '-nic', 'user,model=virtio-net-pci'
    ];
    if (process.platform === 'darwin' && process.arch === 'x64') args.push('-accel', 'hvf');
    else if (process.platform === 'darwin' || process.platform === 'linux') args.push('-accel', 'tcg');
  }

  try {
    vm = spawn(qemu, args, { stdio: 'ignore', windowsHide: false });
    vm.on('error', e => {
      if (win) win.webContents.send('vm-status', { running: false, message: e.message });
    });
    vm.on('exit', code => {
      vm = null;
      if (win) win.webContents.send('vm-status', { running: false, message: 'QEMU exited (code ' + code + ').' });
    });
    const firmwareNote = armGuest && !findArmFirmware(qemu)
      ? ' No bundled ARM UEFI firmware was found; some installer ISOs may not boot.'
      : '';
    return {
      running: true,
      message: 'QEMU launched (' + (armGuest ? 'ARM64' : 'x86_64') + '). Guest disk: ' +
        diskPath + ' · ' + cpu + ' CPU cores · ' + ram + ' GB RAM. Close the QEMU window to stop it.' + firmwareNote
    };
  } catch (e) {
    vm = null;
    throw e;
  }
});

ipcMain.handle('stop-vm', () => {
  if (vm && !vm.killed) {
    vm.kill();
    vm = null;
    return true;
  }
  return false;
});

app.whenReady().then(createWindow);
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
app.on('window-all-closed', () => {
  if (vm && !vm.killed) vm.kill();
  if (process.platform !== 'darwin') app.quit();
});
