import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {expect,it} from 'vitest';
import {publishReady,readReady} from '../scripts/schedule-sync/manifest';
import {scheduleFixture} from './schedule-fixture';

it('reads only an atomically published partial plan and rejects altered candidate bytes',async()=>{
 const root=await mkdtemp(join(tmpdir(),'schedule-ready-')),folder=join(root,'02_candidates');
 await mkdir(folder);
 const candidate=scheduleFixture();
 candidate.accountBinding='a'.repeat(64);
 const file=join(folder,'candidate.json'),relative='02_candidates/candidate.json';
 await writeFile(file,JSON.stringify(candidate));
 expect(await readReady(root)).toBeNull();
 const observedAt='2026-11-11T23:00:00.000Z';
 const manifest=await publishReady(root,relative,observedAt,['第11回']);
 expect(await readReady(root)).toMatchObject({manifest,candidate});
 await expect(publishReady(root,'02_candidates/../candidate.json',observedAt,['第11回'])).rejects.toThrow('02_candidates直下');
 await writeFile(file,JSON.stringify(candidate,null,2));
 await expect(readReady(root)).rejects.toThrow('SHA-256');
});
