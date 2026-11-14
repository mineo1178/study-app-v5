"""Project verified public display facts from a private catalog; never export task bindings."""
import argparse,csv,json,re
from pathlib import Path
NAMES={'確認テスト','計算テスト','漢字テスト','言語知識テスト','基礎力強化プリント','理科まとめプリント','歴史年代チェックテスト','歴史年代表','組分け直前！総合確認問題','組分けテスト対策','11月組分けテスト対策','組分け対策','ポイントチェックプリント','レベルアッププリント','総合演習問題','組分け対策テスト'}
TOPICS={'ヒトと動物の呼吸・循環','鎌倉時代','速さと比','物の燃焼','室町時代','旅人算と比','ばね・浮力・圧力','安土・桃山時代','平面図形と比－まとめと応用－','流水と地層','江戸時代⑴','図形の移動','総合','光と音','江戸時代⑵','仕事に関する問題','火山と地震','江戸時代⑶','水深の変化と比','速さと比・旅人算と比（第6・7回範囲）'}
SUBJECTS={'算数':'math','国語':'japanese','理科':'science','社会':'social','国語（内容分類）':'japanese','理科（内容分類）':'science','算数（内容分類）':'math'}
def project(rows):
    output={};skipped=0
    for r in rows:
        if r['format']!='pdf' or r['presence']!='present':continue
        name=r['formalName'] if r['formalName'] in NAMES else r['materialType'] if r['materialType'] in NAMES else None
        if not name or r['nameStatus'] not in ['一部確認','名称確認（taskIdとは別）'] or not re.fullmatch('[a-f0-9]{64}',r['sha256']):skipped+=1;continue
        row={'materialId':'material-'+r['sha256'],'name':name,'nameConfirmed':r['formalName']==name,'round':int(r['round']) if re.fullmatch('[0-9]{1,2}',r['round']) else None,'subject':SUBJECTS.get(r['subject']),'difficulty':r['classification'] if r['classification'] in ['BASIC','STANDARD','ADVANCE'] else None,'targetClass':'SS' if name=='レベルアッププリント' and r['classification']=='SS（クラス区分）' else None,'topic':r['topic'] if r['topic'] in TOPICS else None}
        key=row['materialId']
        if key in output and output[key]!=row:raise ValueError('同一ハッシュの表示情報が矛盾しています')
        output[key]=row
    return [output[k] for k in sorted(output)],skipped
if __name__=='__main__':
    a=argparse.ArgumentParser();a.add_argument('--catalog',required=True);a.add_argument('--output',required=True);args=a.parse_args()
    with Path(args.catalog).open(encoding='utf-8-sig',newline='') as f:rows,skipped=project(list(csv.DictReader(f)))
    Path(args.output).write_text(json.dumps(rows,ensure_ascii=False,indent=1)+'\n',encoding='utf-8')
    print(json.dumps({'exported':len(rows),'formalNameConfirmed':sum(r['nameConfirmed'] for r in rows),'typeOnly':sum(not r['nameConfirmed'] for r in rows),'omittedPdf':skipped}))
