/**
 * hopsoft\screeps-statsd
 *
 * Licensed under the MIT license
 * For full copyright and license information, please see the LICENSE file
 * 
 * @author     Bryan Conrad <bkconrad@gmail.com>
 * @copyright  2016 Bryan Conrad
 * @link       https://github.com/hopsoft/docker-graphite-statsd
 * @license    http://choosealicense.com/licenses/MIT  MIT License
 */

/**
 * SimpleClass documentation
 *
 * @since  0.1.0
 */
import fetch from 'node-fetch';
import StatsD from 'node-statsd';
import zlib from 'zlib';

export default class ScreepsStatsd {
  _host;
  _email;
  _password;
  _shard;
  _graphite;
  _token;
  _memtype;
  _segment;
  _path;
  _uri;
  _client;
  constructor(host, email, password, shard, graphite, memtype, segment, path) {
    this._host = host;
    this._email = email;
    this._password = password;
    this._shard = shard;
    this._graphite = graphite;
    this._memtype = (memtype === 'memory' || memtype === 'memory-segment') ? memtype : 'memory';
    this._segment = segment;
    this._path = path || 'stats';
    this._client = new StatsD({host: this._graphite});
  }
  run( string ) {
    this.signin();

    setInterval(() => this.loop(), 15000);
  }

  loop() {
    this.getMemory();
  }

  async signin() {
    if(this._token) {
      return;
    }
    console.log("New login request -", new Date());
    const response = await fetch(this._host + '/api/auth/signin', {
      method: 'POST',
      body: JSON.stringify({
        email: this._email,
        password: this._password
      }),
      headers: {
        'content-type': 'application/json'
      }
    });
    const data = await response.json();
    this._token = data.token;
  }

  async getMemory() {
    try {
      await this.signin();

      if (!this._uri) {
        let uri = '/api/user/' + this._memtype + '?';
        if (this._memtype === 'memory-segment') {
          uri += `segment=${this._segment}`;
        }
        else {
          uri += `path=${this._path}`;
        }
        if (this._shard) {
          uri += `&shard=${this._shard}`;
        }
        this._uri = uri;
      }
      // console.log(this._host + this._uri);
      const response = await fetch(this._host + this._uri, {
        method: 'GET',
        headers: {
          "X-Token": this._token,
          "X-Username": this._token,
          'content-type': 'application/json',
        }
      });
      const data = await response.json();
      
      this._token = response.headers['x-token'];
      if (!data?.data || data.error) throw new Error(data?.error ?? 'No data');
      let stringData;
      if (this._memtype === 'memory') {
        //memory comes as gz
        const gzipData = new Buffer.from(data.data.split('gz:')[1], 'base64');
        stringData = zlib.gunzipSync(gzipData).toString();
      }
      else {
        //segments come as plain text
        stringData = data.data;
      }
      // console.log(stringData);
      const parsedData = JSON.parse(stringData);
      this.report(parsedData);
    } catch (e) {
      console.error(e);
      this._token = undefined;
    }
  }

  report(data, prefix="") {
    if (!data) { 
      return; 
    }
    if (prefix === '') console.log("Pushing to gauges -", new Date())
    for (const [k,v] of Object.entries(data)) {
      if (typeof v === 'object') {
        this.report(v, prefix+k+'.');
      } else {
        this._client.gauge(prefix+k, v);
      }
    }
  }
}
