import importlib.util
from pathlib import Path
import unittest
spec=importlib.util.spec_from_file_location('material_export',Path(__file__).with_name('export-material-display.py'))
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
def row(**extra):
    return {'format':'pdf','presence':'present','formalName':'確認テスト','materialType':'確認テスト','nameStatus':'一部確認','sha256':'a'*64,'round':'12','subject':'理科','classification':'ADVANCE','topic':'火山と地震',**extra}
class ExportTests(unittest.TestCase):
    def test_private_fields_are_never_projected(self):
        result,_=module.project([row(relativePath='private/path',relatedTaskIds='private-task',candidateTaskIds='private-candidate',originalSource='private-source')])
        self.assertEqual(set(result[0]),{'materialId','name','nameConfirmed','round','subject','difficulty','targetClass','topic'})
    def test_unknown_names_topics_and_missing_files_are_not_published(self):
        result,skipped=module.project([row(formalName='private custom name',materialType='private custom name'),row(presence='missing'),row(topic='private custom topic')])
        self.assertEqual(len(result),1);self.assertEqual(skipped,1);self.assertIsNone(result[0]['topic'])
    def test_class_is_not_a_difficulty_and_conflicting_hashes_fail(self):
        result,_=module.project([row(formalName='レベルアッププリント',materialType='レベルアッププリント',classification='SS（クラス区分）')])
        self.assertIsNone(result[0]['difficulty']);self.assertEqual(result[0]['targetClass'],'SS')
        with self.assertRaises(ValueError):module.project([row(),row(topic='総合')])
if __name__=='__main__':unittest.main(verbosity=2)
