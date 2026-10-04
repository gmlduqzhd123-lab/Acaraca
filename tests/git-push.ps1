$token = (@'
protocol=https
host=github.com
'@ | & 'C:\Program Files\Git\mingw64\libexec\git-core\git-credential-wincred.exe' get | Select-String 'password=').ToString().Replace('password=', '').Trim()
git push "https://${token}@github.com/gmlduqzhd123-lab/Acaraca.git" main
git fetch "https://${token}@github.com/gmlduqzhd123-lab/Acaraca.git" main:refs/remotes/origin/main
