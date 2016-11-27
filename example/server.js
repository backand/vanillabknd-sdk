var express = require('express');
var app = express();
var path = require('path');

app.use(express.static('.'));
app.use('/dist', express.static('./../dist'));

app.get('/', function(req, res){
  res.sendFile(path.join(__dirname + '/demo.html'));
});

app.listen(3000, () => {
  console.log('listening');
});
