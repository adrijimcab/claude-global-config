# Reads the TEMP of every process of the current user: one line per process, `pid<TAB>parentPid<TAB>name<TAB>TEMP`,
# TEMP empty when the process has none and `?` when its environment cannot be read (another user, protected, gone).
# It reads the process environment block through NtQueryInformationProcess (PEB address and parent pid) and
# ReadProcessMemory (PEB -> RTL_USER_PROCESS_PARAMETERS -> Environment). x64 layout: ProcessParameters at PEB+0x20,
# Environment at +0x80, EnvironmentSize at +0x3F0 (Windows 8 and later).
# @es Lee el TEMP de cada proceso del usuario actual: una linea por proceso, `pid<TAB>parentPid<TAB>nombre<TAB>TEMP`,
# TEMP vacio si no tiene y `?` si su entorno no se puede leer (otro usuario, protegido, ya muerto). Lee el bloque de
# entorno por NtQueryInformationProcess y ReadProcessMemory, con el layout x64 indicado arriba.

Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

public static class ProcessEnvironmentReader
{
    [StructLayout(LayoutKind.Sequential)]
    struct ProcessBasicInformation
    {
        public IntPtr ExitStatus;
        public IntPtr PebBaseAddress;
        public IntPtr AffinityMask;
        public IntPtr BasePriority;
        public IntPtr UniqueProcessId;
        public IntPtr InheritedFromUniqueProcessId;
    }

    [DllImport("ntdll.dll")]
    static extern int NtQueryInformationProcess(IntPtr process, int infoClass, ref ProcessBasicInformation info, int size, out int returned);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern IntPtr OpenProcess(uint access, bool inherit, int pid);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool ReadProcessMemory(IntPtr process, IntPtr address, byte[] buffer, IntPtr size, out IntPtr read);

    [DllImport("kernel32.dll")]
    static extern bool CloseHandle(IntPtr handle);

    const uint QueryInformation = 0x0400;
    const uint VmRead = 0x0010;
    const long MaxEnvironmentBytes = 4 * 1024 * 1024;

    static byte[] Read(IntPtr process, IntPtr address, long size)
    {
        byte[] buffer = new byte[size];
        IntPtr read;

        if (!ReadProcessMemory(process, address, buffer, (IntPtr)size, out read)) return null;

        return buffer;
    }

    static IntPtr ReadPointer(IntPtr process, IntPtr address)
    {
        byte[] bytes = Read(process, address, 8);

        return bytes == null ? IntPtr.Zero : (IntPtr)BitConverter.ToInt64(bytes, 0);
    }

    static string Environment(IntPtr process, IntPtr peb)
    {
        IntPtr parameters = ReadPointer(process, IntPtr.Add(peb, 0x20));
        if (parameters == IntPtr.Zero) return null;

        IntPtr block = ReadPointer(process, IntPtr.Add(parameters, 0x80));
        byte[] sizeBytes = Read(process, IntPtr.Add(parameters, 0x3F0), 8);
        if (block == IntPtr.Zero || sizeBytes == null) return null;

        long size = Math.Min(BitConverter.ToInt64(sizeBytes, 0), MaxEnvironmentBytes);
        byte[] data = size > 0 ? Read(process, block, size) : null;

        return data == null ? null : Encoding.Unicode.GetString(data);
    }

    static string TempOf(string environment)
    {
        foreach (string entry in environment.Split('\0'))
        {
            if (entry.StartsWith("TEMP=", StringComparison.OrdinalIgnoreCase)) return entry.Substring(5);
        }

        return "";
    }

    public static List<string> ReadAll()
    {
        List<string> lines = new List<string>();

        foreach (Process each in Process.GetProcesses())
        {
            int pid = each.Id;
            string name = each.ProcessName;
            string temp = "?";
            long parent = 0;
            IntPtr handle = OpenProcess(QueryInformation | VmRead, false, pid);

            if (handle != IntPtr.Zero)
            {
                ProcessBasicInformation info = new ProcessBasicInformation();
                int returned;

                if (NtQueryInformationProcess(handle, 0, ref info, Marshal.SizeOf(info), out returned) == 0)
                {
                    parent = (long)info.InheritedFromUniqueProcessId;
                    string environment = info.PebBaseAddress == IntPtr.Zero ? null : Environment(handle, info.PebBaseAddress);
                    if (environment != null) temp = TempOf(environment);
                }

                CloseHandle(handle);
            }

            lines.Add(pid + "\t" + parent + "\t" + name + "\t" + temp);
            each.Dispose();
        }

        return lines;
    }
}
'@

[ProcessEnvironmentReader]::ReadAll() | ForEach-Object { Write-Output $_ }
