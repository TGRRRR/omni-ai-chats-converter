a = Analysis(['server.py'])
a.datas += [('web/', 'web/', 'DATA')]
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, a.binaries, a.datas, name='OmniAIConverter', console=False, exclude_binaries=True)
coll = COLLECT(exe, a.binaries, a.datas, strip=False, upx=True)