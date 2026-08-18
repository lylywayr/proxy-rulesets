# AppPrivacyServices 镜像规则集

这四个规则集没有可直接采用的独立上游，因此由 `Auto-AppPrivacy-Private-Rules` 的本地隐私审计规则维护，并与私有仓库双向镜像：

- `GIF.list`
- `MiHome.list`
- `Taobao.list`
- `Quark.list`

正式 Surge/Egern 配置通过本公共仓库的 Raw 地址引用前三项；配置文件、订阅入口、节点与其他私有信息仍仅保留在私有仓库。

## 同步约定

- 在任一仓库修改上述规则文件并推送 `main` 后，GitHub Actions 会镜像到另一仓库。
- 镜像提交带 `[mirror-sync]` 标记，避免双向触发形成循环。
- 同时修改同一文件时，以先进入目标仓库 `main` 的版本为准；另一侧随后需要基于最新 `main` 再次修改并推送。
