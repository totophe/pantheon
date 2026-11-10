import { item, ref, type Entry, type Integration, type Note, type Rel, type Sim, type SourceData, type Status } from './types';

export interface Container {
  id: string; name: string; guest: string; image: string; status: Status; mem: string; up: string;
  cpu?: number; memp?: number; memt?: string; notes?: Note[]; events?: Entry[]; rel?: Rel[];
}
export interface DockerData extends SourceData { containers: Container[] }

const RUNNING: [string, string, string, string][] = [
  ['radarr', 'hermes', 'linuxserver/radarr', '612 MB'], ['lidarr', 'hermes', 'linuxserver/lidarr', '388 MB'], ['prowlarr', 'hermes', 'linuxserver/prowlarr', '201 MB'],
  ['transmission', 'hermes', 'linuxserver/transmission', '944 MB'], ['overseerr', 'hermes', 'sctx/overseerr', '256 MB'],
  ['plex', 'apollo', 'plexinc/pms-docker', '3.1 GB'], ['tautulli', 'apollo', 'tautulli/tautulli', '210 MB'], ['audiobookshelf', 'apollo', 'advplyr/audiobookshelf', '330 MB'], ['komga', 'apollo', 'gotson/komga', '640 MB'],
  ['gitea-app', 'gitea', 'gitea/gitea:1.22', '640 MB'], ['act-runner', 'gitea', 'gitea/act_runner', '120 MB'], ['caddy-proxy', 'caddy', 'lucaslorentz/caddy-docker-proxy', '90 MB'],
  ['victoriametrics', 'monitoring', 'victoriametrics/victoria-metrics', '1.4 GB'], ['vmagent', 'monitoring', 'victoriametrics/vmagent', '310 MB'], ['uptime-kuma', 'monitoring', 'louislam/uptime-kuma', '160 MB'], ['pantheon', 'monitoring', 'pantheon/server', '240 MB'],
  ['ollama-a', 'kronos', 'ollama/ollama', '6.2 GB'], ['ollama-b', 'kronos', 'ollama/ollama', '4.8 GB'], ['vllm-server', 'vllm', 'vllm/vllm-openai', '22 GB'],
];

function mock(sim: Sim): DockerData {
  const S = sim.sonarrFixed;
  const sonarr: Container = {
    id: 'sonarr', name: 'sonarr', guest: 'hermes', image: 'linuxserver/sonarr:4', status: S ? 'ok' : 'warn',
    mem: S ? '820 MB / 1.5 GB' : '1.0 GB / 1 GB', up: S ? 'up 1 min' : 'restarting (OOM ×3)',
    memp: S ? 55 : 100, memt: S ? '55%' : '100% · OOM',
    notes: S ? [] : [{ t: 'OOM-killed after update', tone: 'warn', action: ['Raise limit to 1.5 GB & restart', 'sonarr'], text: 'Exit code 137 three times in an hour since Watchtower pulled a new image. The new version needs more than the 1 GB limit.' }],
    events: S ? [item('Restarted with 1.5 GB limit', 'Pantheon action', 'just now', 'ok')] : [item('OOM-killed (137)', 'docker', '10:42', 'warn'), item('OOM-killed (137)', 'docker', '10:21', 'warn'), item('Image updated', 'watchtower', '09:58', 'info')],
    rel: [['Service', [ref('svc-media')]]],
  };
  return {
    containers: [sonarr, ...RUNNING.map(([id, guest, image, mem]): Container => ({
      id, guest, image, mem, status: 'ok',
      name: id.replace('-app', '').replace('caddy-proxy', 'caddy-docker-proxy'),
      up: 'up ' + (guest === 'hermes' ? '6 d' : '23 d'),
    }))],
    alerts: [
      { id: 'a5', sev: 'warn', title: 'sonarr restarting (OOM)', where: 'hermes · sonarr', when: '40 min', obj: 'sonarr', resolved: S, domain: 'Workloads', action: 'Fix' },
      { id: 'a6', sev: 'info', title: '3 container image updates', where: 'prometheus', when: '1 d', obj: 'prometheus', resolved: false, domain: 'Updates', action: 'Review' },
    ],
    updates: [['prometheus', '3 container images', 'Docker']],
    changes: [{ t: '10:58', k: 'Workloads', x: 'Watchtower updated 4 images in hermes' }],
  };
}

export const docker: Integration<DockerData> = { id: 'docker', name: 'Docker agents', covers: '9 hosts · containers · images · restarts', sync: '15 s', mock };
