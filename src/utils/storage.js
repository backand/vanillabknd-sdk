export default class Storage {
  constructor (type, prefix = '') {
    if (!window[type + 'Storage'])
      throw new Error(type + 'Storage is not supported by the browser');
    this.prefix = prefix;
    this.delimiter = '__________';
    this.storage = window[type + 'Storage'];
  }
  get (key) {
    let item = this.storage.getItem(`${this.prefix}${key}`);
    if (!item) {
      return item
    }
    else {
      let [type, val] = item.split(this.delimiter);
      if (type != 'JSON') {
        return val;
      }
      else {
        return JSON.parse(val);
      }
    }
  }
  set (key, val) {
    if (typeof val != 'object') {
      this.storage.setItem(`${this.prefix}${key}`, `STRING${this.delimiter}${val}`);
    }
    else {
      this.storage.setItem(`${this.prefix}${key}`, `JSON${this.delimiter}${JSON.stringify(val)}`);
    }
  }
  remove (key) {
    this.storage.removeItem(`${this.prefix}${key}`);
  }
  clear() {
    for(var i =0; i < this.storage.length; i++){
       if(this.storage.getItem(this.storage.key(i)).indexOf(this.prefix) != -1)
        this.remove(this.storage.key(i))
    }
  }
}
