var expect = chai.expect;
var lastCreatedId = null;

describe('Backand.initiate', () => {
  it('should initiate backand namespace', () => {
    expect(backand.initiate).to.be.an('function');
    backand.initiate({
      appName: 'sdk',
      signUpToken: '851692ae-eb94-4f18-87ee-075255e67748',
      anonymousToken: '82cfcfe8-c718-4621-8bb6-cd600e23487f',
      runSocket: true
    });
    expect(backand).to.be.an('object');
    expect(backand).to.have.all.keys('service', 'constants', 'helpers', 'socket');
  });

  describe('Backand.service', () => {
    describe('auth', () => {
      it('useAnonymousAuth', function(done) {
        this.timeout(0);
        backand.service.useAnonymousAuth()
        .then(res => {
          expect(res.data.username).to.eql('anonymous');
          done();
        })
        .catch(err => {
          done(err);
        })
      });
      it('signin', function(done) {
        this.timeout(0);
        backand.service.signin('sdk@backand.com', 'Password1')
        .then(res => {
          expect(res.data.username).to.eql('sdk@backand.com');
          done();
        })
        .catch(err => {
          done(err);
        })
      });
      it('getUserDetails', function(done) {
        this.timeout(0);
        backand.service.getUserDetails()
        .then(res => {
          expect(res.data.username).to.eql('sdk@backand.com');
          done();
        })
        .catch(err => {
          done(err);
        })
      });
      it('changePassword 1', function() {
        this.timeout(0);
        return backand.service.changePassword('Password1','Password2')
      });
      it('changePassword 2', function() {
        this.timeout(0);
        return backand.service.changePassword('Password2', 'Password1');
      });
      it('signout', function(done) {
        this.timeout(0);
        backand.service.signout()
        .then(res => {
          expect(res.data).to.be.null;
          backand.service.useAnonymousAuth();
          done();
        })
        .catch(err => {
          done(err);
        })
      });
    });
    describe('crud', () => {
      it('getList', function() {
        this.timeout(0);
        return backand.service.getList('items');
      });
      it('create', function(done) {
        this.timeout(0);
        backand.service.create('items',{
          name:'test',
          description:'new item'
        })
        .then(res => {
          lastCreatedId = res.data.__metadata.id;
          done();
        })
        .catch(err => {
          done(err);
        })
      });
      it('getOne 1', function(done) {
        this.timeout(0);
        backand.service.getOne('items', lastCreatedId)
        .then(res => {
          expect(res.data.description).to.eql('new item');
          done();
        })
        .catch(err => {
          done(err);
        })
      });
      it('update', function() {
        this.timeout(0);
        return backand.service.update('items',lastCreatedId, {
          name:'test',
          description:'old item'
        });
      });
      it('getOne 2', function(done) {
        this.timeout(0);
        backand.service.getOne('items', lastCreatedId)
        .then(res => {
          expect(res.data.description).to.eql('old item');
          done();
        })
        .catch(err => {
          done(err);
        })
      });
      it('remove', function() {
        this.timeout(0);
        return backand.service.remove('items', lastCreatedId);
      });
    });
    describe('files', () => {
      it('uploadFile', function() {
        this.timeout(0);
        var file = new File(["test"], 'file2upload');
        var reader  = new FileReader();
        reader.readAsDataURL(file);
        reader.addEventListener("load", function () {
          backand.service.uploadFile('items', 'files', file.name, reader.result)
          .then(res => {
            done();
          })
          .catch(err => {
            done(err);
          })
        }, false);
      });
      it('deleteFile', function() {
        this.timeout(0);
        return backand.service.deleteFile('items','files', 'file2upload');
      });
    });
  });
  describe('Backand.helpers', () => {
    it('should have some impotant keys', () => {
      expect(backand.helpers).to.have.all.keys('filter', 'sort', 'exclude', 'StorageAbstract');
    });
  });
  describe('Backand.constants', () => {
    it('should have some impotant keys', () => {
      expect(backand.constants).to.have.all.keys('EVENTS', 'URLS', 'SOCIAL_PROVIDERS');
    });
  });
  describe('Backand.socket', () => {
    it('should have on function', () => {
      expect(backand.socket.on).to.be.an('function');
    });
    it('should listen to events from server', function(done) {
      this.timeout(5000);
      setTimeout(function () {
        backand.service.trigger('items', 'socket_test');
      }, 1000);
      backand.socket.on('socket_test', data => {
        expect(data).to.eql('test');
        done();
      });
    });
  });
});
