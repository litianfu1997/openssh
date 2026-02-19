export default {
    app: {
        title: 'OpenSSH 客户端',
    },
    sidebar: {
        search: '搜索主机...',
        add_host: '添加', // 简短一点
        no_hosts: '还没有主机',
        group_default: '默认分组',
        refresh: '刷新',
        edit: '编辑',
    },
    welcome: {
        title: 'OpenSSH Client',
        desc: '轻量、清新、好用的 SSH 连接工具',
        add_first: '添加第一台主机',
        tips: {
            connect: '主机连接',
            add: '添加主机',
            auth: '支持 密码 & 密钥认证',
        },
    },
    dialog: {
        title_add: '添加主机',
        title_edit: '编辑主机',
        name: '主机名称', //Label
        group: '分组',
        host: '主机地址',
        port: '端口',
        username: '用户名',
        password: '密码',
        private_key: '私钥内容',
        passphrase: '私钥密码（可选）',
        desc: '备注',
        save: '保存',
        delete: '删除',
        cancel: '取消',
        confirm_delete: '确认删除主机 "{name}" 吗？',
        auth_password: '密码认证',
        auth_key: '密钥认证',
        placeholder_name: '例：生产服务器',
        placeholder_host: 'ip 或 域名',
        placeholder_group: '默认分组',
        placeholder_key: '粘贴 PEM 格式私钥内容...',
        placeholder_passphrase: '如果私钥有密码请填写',
        placeholder_desc: '可选备注信息'
    },
    tab: {
        duplicate: '复制会话',
        close_others: '关闭其他标签',
        close_this: '关闭此标签',
        rename: '重命名',
    },
    term: {
        connecting: '正在连接',
        connected: '已连接',
        closed: '[连接已关闭]',
        error: '连接失败',
        retry: '重新连接',
        ctx_copy: '复制',
        ctx_paste: '粘贴',
        ctx_clear: '清屏',
    },
}
