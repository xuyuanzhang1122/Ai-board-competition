from pathlib import Path
import os, subprocess, sys
r=Path(__file__).resolve().parents[3]
j=next((r/'.superpowers/tools').glob('jdk-*/Contents/Home'))
e=dict(os.environ,JAVA_HOME=str(j),PATH=str(j/'bin')+os.pathsep+os.environ['PATH'])
selection=sys.argv[1]
name=Path(sys.argv[2]).name if len(sys.argv)>2 else 'latest-java.log'
c=[str(r/'.superpowers/tools/apache-maven-3.9.9/bin/mvn'),'-o','-B','-ntp','-f','backend/pom.xml','-s','backend/settings.xml','-Dmaven.repo.local='+str(r/'.superpowers/m2'),'-Dtest='+selection,'test']
l=Path(__file__).parent/name
with l.open('w') as o:p=subprocess.run(c,cwd=r,env=e,stdout=o,stderr=subprocess.STDOUT)
print('\n'.join(l.read_text().splitlines()[-22:]))
sys.exit(p.returncode)
