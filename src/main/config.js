import Store from 'electron-store'

const store = new Store({
    name: 'config',
    defaults: {
        autoCheckUpdate: true
    }
})

export function getAutoCheckUpdate() {
    return store.get('autoCheckUpdate', true)
}

export function setAutoCheckUpdate(enabled) {
    store.set('autoCheckUpdate', !!enabled)
}
