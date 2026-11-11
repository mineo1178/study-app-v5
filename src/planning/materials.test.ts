import { describe, expect, it } from "vitest";
import { materialInfo, newMaterialTask, parseMaterials, type Material } from "./materials";
const m:Material={materialId:'material-'+'a'.repeat(64),title:'教材',unit:'第11回',subject:'math',category:'プリント',requirement:'reinforcement',references:[{name:'problem.pdf',sha256:'a'.repeat(64),role:'problem'},{name:'answer.pdf',sha256:'b'.repeat(64),role:'answer'}]};
const raw=(materials:Material[])=>JSON.stringify({schemaVersion:1,materials});
describe('private material metadata',()=>{
 it('shares one stable ID and task for problem and answer; renaming preserves identity',()=>{const first=newMaterialTask(parseMaterials(raw([m]))[0]);const renamed=newMaterialTask({...m,references:[{...m.references[0],name:'renamed.pdf'},m.references[1]]});expect(first.id).toBe(renamed.id);expect(first.planning.material?.references).toHaveLength(2);});
 it('rejects duplicate PDF hashes, paths, unconfirmed task registration and unknown subjects',()=>{expect(()=>parseMaterials(raw([m,m]))).toThrow('重複');expect(()=>parseMaterials(raw([{...m,references:[{...m.references[0],name:'C:/private.pdf'}]}]))).toThrow();expect(()=>materialInfo({...m,requirement:'unconfirmed'})).toThrow();expect(()=>parseMaterials(raw([{...m,subject:'wrong' as Material['subject']}]))).toThrow();});
});
