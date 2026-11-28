import React, { useState } from 'react';
import {
  Database,
  Globe,
  HardDriveDownload,
  KeyRound,
  Network,
  Power,
  Server,
  ShieldCheck,
  Trash2,
  Wifi,
} from 'lucide-react';
import type { ClusterNode, NovaSwarmState } from '../../shared/types';
import { useLocale } from '../locales/translations';
import { InfoHint } from './InfoHint';

export const Batch3InfraClusterPanel: React.FC<{
  state?: NovaSwarmState;
  clusterNodes?: ClusterNode[];
  onRefreshState: () => Promise<void>;
}> = ({ state, clusterNodes, onRefreshState }) => {
  const { tx } = useLocale();
  const [wolMac, setWolMac] = useState('AA:BB:CC:DD:EE:FF');
  const [wolName, setWolName] = useState(() => tx('Munkaállomás'));
  const [wolMsg, setWolMsg] = useState<string | null>(null);

  const [wgBundle, setWgBundle] = useState<{ publicKeyBase64: string; configText: string; qrSvg: string } | null>(null);
  const [arpList, setArpList] = useState<Array<{ ip: string; mac: string; iface: string; state: string }>>([]);
  const [speedOut, setSpeedOut] = useState<{ ok: boolean; pingMs: number; downloadMbps: number; error?: string } | null>(null);

  const [osintDomain, setOsintDomain] = useState('github.com');
  const [osintOut, setOsintOut] = useState<string>('');

  const [nodeName, setNodeName] = useState('GPU-Node-1');
  const [nodeUrl, setNodeUrl] = useState('http://192.168.1.50:11434');
  const [nodeRole, setNodeRole] = useState<'gpu_ollama' | 'worker' | 'storage'>('gpu_ollama');

  const [walStatus, setWalStatus] = useState<string | null>(null);
  const [auditVerify, setAuditVerify] = useState<string | null>(null);
  const [phoenixMsg, setPhoenixMsg] = useState<string | null>(null);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Power className="h-4 w-4" />
          <span>{tx('Távoli Gép Ébresztő (WOL) & WireGuard VPN')}</span>
          <InfoHint
            label={tx('Ébresztő és WireGuard')}
            text={tx('Helyi hálózaton keresztül felébreszti az alvó számítógépedet, vagy biztonságos WireGuard kulcspárt és QR kódot készít telefonhoz.')}
          />
        </h3>
        <div className="flex flex-wrap gap-2 text-xs">
          <input type="text" value={wolName} onChange={(e) => setWolName(e.target.value)} placeholder={tx('Eszköz név')} className="w-32 px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 rounded bg-transparent" />
          <input type="text" value={wolMac} onChange={(e) => setWolMac(e.target.value)} placeholder={tx('MAC cím')} className="flex-1 px-2.5 py-1.5 font-mono border border-slate-300 dark:border-slate-700 rounded bg-transparent" />
          <button
            type="button"
            onClick={async () => {
              const r = await fetch('/api/v3/wol', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mac: wolMac, saveName: wolName }),
              });
              const d = await r.json();
              setWolMsg(d.message);
              await onRefreshState();
            }}
            className="px-3 py-1.5 bg-slate-900 text-white rounded-lg whitespace-nowrap shrink-0"
          >
            {tx('WOL Magic Packet')}
          </button>
        </div>
        {wolMsg && <div className="text-xs font-mono text-emerald-700 dark:text-emerald-400">{wolMsg}</div>}
        <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2 text-xs">
          <button
            type="button"
            onClick={async () => {
              const r = await fetch('/api/v3/wireguard/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clientName: 'NovaSwarm-Mobil' }),
              });
              if (r.ok) setWgBundle(await r.json());
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg whitespace-nowrap shrink-0"
          >
            <KeyRound className="h-3.5 w-3.5" />
            {tx('WireGuard X25519 Konfig + QR Generálás')}
          </button>
          {wgBundle && (
            <div className="flex flex-wrap gap-3 items-start">
              <pre className="flex-1 p-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded text-[10px] font-mono overflow-x-auto">
                {wgBundle.configText}
              </pre>
              <div className="border border-slate-200 rounded p-1 bg-white">
                <img
                  src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(wgBundle.qrSvg)}`}
                  alt="WireGuard QR"
                  className="w-36 h-36"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Wifi className="h-4 w-4" />
          <span>{tx('Helyi Hálózati Eszközök, Sebességteszt & Domain Ellenőrző')}</span>
          <InfoHint
            label={tx('Hálózati eszközök')}
            text={tx('Kilistázza az otthoni router által látott eszközöket, leméri az internet sebességét és ellenőrzi egy domain tanúsítványát.')}
          />
        </h3>
        <div className="flex flex-wrap gap-2 text-xs">
          <button
            type="button"
            onClick={async () => {
              const r = await fetch('/api/v3/lan-arp');
              const d = await r.json();
              setArpList(d.devices || []);
            }}
            className="inline-flex items-center gap-1 px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg whitespace-nowrap shrink-0"
          >
            <Network className="h-3.5 w-3.5" />
            {tx('LAN ARP Tábla')}
          </button>
          <button
            type="button"
            onClick={async () => {
              const r = await fetch('/api/v3/speedtest', { method: 'POST' });
              if (r.ok) setSpeedOut(await r.json());
            }}
            className="px-3 py-1.5 bg-slate-900 text-white rounded-lg whitespace-nowrap shrink-0"
          >
            {tx('Net Sebességteszt')}
          </button>
        </div>
        {speedOut && (
          <div className="text-xs font-mono">
            {speedOut.ok ? tx('Ping: {0}ms · Letöltés: {1} Mbps', speedOut.pingMs, speedOut.downloadMbps) : tx('Hiba: {0}', speedOut.error ?? '')}
          </div>
        )}
        {arpList.length > 0 && (
          <div className="text-[11px] font-mono max-h-24 overflow-y-auto space-y-1">
            {arpList.map((d, i) => (
              <div key={i}>{d.ip} [{d.mac}] ({d.iface})</div>
            ))}
          </div>
        )}
        <div className="flex gap-2 text-xs pt-2 border-t border-slate-200 dark:border-slate-800">
          <input type="text" value={osintDomain} onChange={(e) => setOsintDomain(e.target.value)} className="flex-1 px-2.5 py-1.5 font-mono border border-slate-300 dark:border-slate-700 rounded bg-transparent" />
          <button
            type="button"
            onClick={async () => {
              const r = await fetch('/api/v3/osint-domain', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ domain: osintDomain }),
              });
              if (r.ok) setOsintOut(JSON.stringify(await r.json(), null, 2));
            }}
            className="inline-flex items-center gap-1 px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg whitespace-nowrap shrink-0"
          >
            <Globe className="h-3.5 w-3.5" />
            {tx('OSINT DNS/TLS')}
          </button>
        </div>
        {osintOut && <pre className="p-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded text-[10px] font-mono max-h-28 overflow-auto">{osintOut}</pre>}
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Server className="h-4 w-4" />
          <span>{tx('Többgépes Fürt & Távoli AI Gépek')}</span>
          <InfoHint
            label={tx('Többgépes fürt')}
            text={tx('Ha van otthon másik erős géped vagy GPU-s szervered, itt adhatod hozzá, hogy az asszisztens megoszthassa velük a munkát.')}
          />
        </h3>
        <div className="flex flex-wrap gap-2 text-xs">
          <input type="text" value={nodeName} onChange={(e) => setNodeName(e.target.value)} className="w-28 px-2 py-1.5 border border-slate-300 dark:border-slate-700 rounded bg-transparent" />
          <input type="text" value={nodeUrl} onChange={(e) => setNodeUrl(e.target.value)} className="flex-1 min-w-[160px] px-2 py-1.5 font-mono border border-slate-300 dark:border-slate-700 rounded bg-transparent" />
          <select value={nodeRole} onChange={(e) => setNodeRole(e.target.value as typeof nodeRole)} className="px-2 py-1.5 border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-800">
            <option value="gpu_ollama">GPU Ollama</option>
            <option value="worker">Worker Node</option>
            <option value="storage">NAS / Storage</option>
          </select>
          <button
            type="button"
            onClick={async () => {
              await fetch('/api/v3/cluster/nodes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: nodeName, url: nodeUrl, role: nodeRole }),
              });
              await onRefreshState();
            }}
            className="px-3 py-1.5 bg-slate-900 text-white rounded-lg whitespace-nowrap shrink-0"
          >
            {tx('Hozzáadás')}
          </button>
          <button
            type="button"
            onClick={async () => {
              await fetch('/api/v3/cluster/ping', { method: 'POST' });
              await onRefreshState();
            }}
            className="px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg whitespace-nowrap shrink-0"
          >
            Ping
          </button>
        </div>
        <div className="space-y-1 text-xs font-mono">
          {(clusterNodes ?? state?.clusterNodes ?? []).map((n) => (
            <div key={n.id} className="flex items-center justify-between p-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded">
              <span>{n.name} [{n.role}] · {n.status} ({n.latencyMs ?? '-'}ms)</span>
              <button
                type="button"
                onClick={async () => {
                  await fetch(`/api/v3/cluster/nodes/${n.id}`, { method: 'DELETE' });
                  await onRefreshState();
                }}
                className="text-slate-400 hover:text-red-600"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Database className="h-4 w-4" />
          <span>{tx('Adatbázis Állapot, Audit Hitelesítés & Mentés')}</span>
          <InfoHint
            label={tx('Adatbázis és mentés')}
            text={tx('Ellenőrzi a helyi SQLite adatbázist, a hamisításbiztos audit naplót, és teljes mentési pillanatképet készít.')}
          />
        </h3>
        <div className="flex flex-wrap gap-2 text-xs">
          <button
            type="button"
            onClick={async () => {
              const r = await fetch('/api/v3/sqlite-wal/status');
              const d = await r.json();
              setWalStatus(tx('SQLite WAL: {0} · Audit sorok: {1} · Memóriák: {2}', d.wal.available ? tx('AKTÍV') : tx('Inaktív'), d.wal.auditRows, d.wal.memoryRows));
            }}
            className="px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg whitespace-nowrap shrink-0"
          >
            {tx('SQLite WAL Állapot')}
          </button>
          <button
            type="button"
            onClick={async () => {
              const r = await fetch('/api/v3/audit/verify', { method: 'POST' });
              const d = await r.json();
              setAuditVerify(tx('Audit SHA-256 Lánc: {0} ({1} bejegyzés)', d.valid ? tx('ÉP & HITELES') : tx('SÉRÜLT'), d.checkedEntries));
            }}
            className="inline-flex items-center gap-1 px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg whitespace-nowrap shrink-0"
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            {tx('Audit Lánc Ellenőrzése')}
          </button>
          <button
            type="button"
            onClick={async () => {
              const r = await fetch('/api/v3/phoenix/snapshot', { method: 'POST' });
              const d = await r.json();
              setPhoenixMsg(tx('Phoenix Snapshot kész: {0} ({1} KB, SHA256: {2}...)', d.fileName, Math.round(d.sizeBytes / 1024), d.sha256.slice(0, 12)));
            }}
            className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-900 text-white rounded-lg whitespace-nowrap shrink-0"
          >
            <HardDriveDownload className="h-3.5 w-3.5" />
            {tx('Phoenix Pillanatkép')}
          </button>
        </div>
        {walStatus && <div className="text-xs font-mono text-slate-700 dark:text-slate-300">{walStatus}</div>}
        {auditVerify && <div className="text-xs font-mono text-emerald-700 dark:text-emerald-400">{auditVerify}</div>}
        {phoenixMsg && <div className="text-xs font-mono text-indigo-700 dark:text-indigo-400">{phoenixMsg}</div>}
      </div>
    </div>
  );
};
