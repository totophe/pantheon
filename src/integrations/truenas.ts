import { item, ref, type Entry, type Fact, type HostRecord, type Integration, type Meter, type Rel, type Sim, type SiteId, type SourceData, type Status } from './types';

export interface Pool {
  id: string; name: string; site: SiteId; status: Status; sub: string;
  capacity: Meter[]; health: Fact[]; datasets: Entry[]; copies: Entry[]; rel: Rel[];
}
export interface TrueNasData extends SourceData { host: HostRecord; pools: Pool[] }

function mock(sim: Sim): TrueNasData {
  return {
    host: {
      id: 'alexandria', name: 'Alexandria', site: 'home', status: 'warn', sub: 'TrueNAS Scale · X9SRI-F · 128 GB ECC',
      meters: [['Pool Atlas', 82, '82% · 65 / 80 TB'], ['ARC hit rate', 96, '96%', 'ok'], ['CPU', 12]],
      facts: [['Pool', 'Atlas · RAIDZ-2 · 6 × 20 TB'], ['SLOG / L2ARC', 'Optane P4800X'], ['Last scrub', '6 d ago · 0 errors']],
      guests: [ref('atlas', 'pool'), item('garage', 'TrueNAS app · S3', 'running')],
      rel: [['Connected to', [ref('agg', 'port 7 · 10 GbE')]], ['Pools', [ref('atlas')]], ['Replicates to', [ref('synology', 'Site B · nightly')]]],
    },
    pools: [{
      id: 'atlas', name: 'Atlas', site: 'home', status: 'warn', sub: 'alexandria · ZFS RAIDZ-2 · 6 × 20 TB',
      capacity: [['Used', 82, '65 / 80 TB'], ['Projected at 85%', 30, 'in ~9 days', 'warn']],
      health: [['State', 'ONLINE'], ['Last scrub', '6 d · 0 errors'], ['SLOG', 'Optane P4800X'], ['Compression', 'lz4 · 1.31×']],
      datasets: [item('chronicles', 'movies & TV', '41.2 TB'), item('forge', 'downloads · +1.4 TB this week', '9.8 TB', 'warn', 'warn'), item('nexus', 'service data · NFS', '3.1 TB'), item('vault', 'sensitive · encrypted', '1.4 TB'), item('melodies', 'music', '2.6 TB'), item('scrolls', 'documents', '0.4 TB'), item('limbo', 'staging', '6.5 TB')],
      copies: [item('Snapshots', 'hourly · 48 h, daily · 30 d', 'OK'), item('Offsite · Synology Site B', 'vault · scrolls · nexus', 'today 02:47', 'ok')],
      rel: [['Host', [ref('alexandria')]], ['Used by', [ref('apollo', 'chronicles · melodies'), ref('hermes', 'forge · chronicles'), ref('olympus', 'nexus backups')]], ['Replicates to', [ref('synology')]]],
    }],
    alerts: [{ id: 'a4', sev: 'warn', title: 'Atlas pool 82% full', where: 'alexandria · Atlas', when: '3 h', obj: 'atlas', resolved: false, domain: 'Storage', action: 'Open pool' }],
    updates: [['alexandria', 'TrueNAS Scale point release', 'TrueNAS']],
    changes: [{ t: '02:47', k: 'Replication', x: 'Atlas → Synology finished · 38 GB' }],
    storageTiles: [{ l: 'Atlas', v: '82%', c: 'warn', s: '65 / 80 TB · RAIDZ-2' }],
    volumes: [{ obj: 'atlas', site: 'home', host: 'alexandria', used: '65 / 80 TB', usedLv: 'warn', status: 'Warning', statusLv: 'warn' }],
    backupJobs: [
      { name: 'Atlas → Synology (rsync)', obj: 'atlas', target: 'Site B · /volume1/atlas-offsite', schedule: '02:00', last: sim.rep === 'done' ? 'just now · 1.2 GB' : 'today 02:47 · 38 GB', runnable: true, progressLabel: 'Atlas → Synology · syncing vault' },
      { name: 'Atlas snapshots', obj: 'atlas', target: 'local', schedule: 'hourly', last: '10:00 · OK' },
    ],
  };
}

export const truenas: Integration<TrueNasData> = { id: 'truenas', name: 'TrueNAS · Alexandria', covers: 'pools · datasets · SMART · shares', sync: '10 s', mock };
