import { EnhancedPosition } from '@azure-tools/datastore';
import { PumpMessagesToConsole } from './test-utility';
import { Artifact } from '../lib/artifact';
import { Channel, Message, SourceLocation } from '../lib/message';
import { AutoRest } from '../lib/autorest-core';
import { RealFileSystem } from '@azure-tools/datastore';
import { suite, test, slow, timeout, skip, only } from 'mocha-typescript';
import * as assert from 'assert';

import { CreateFolderUri, ResolveUri } from '@azure-tools/uri';
import { parse } from '@azure-tools/datastore';
import { Configuration } from '../lib/configuration';

@suite class Blaming {

  // gs01/nelson : to do -- we have to come back and make sure this works.
  /* @test */ async 'end to end blaming with literate swagger'() {
    const autoRest = new AutoRest(new RealFileSystem(), ResolveUri(CreateFolderUri(__dirname), '../../test/resources/literate-example/readme-composite.md'));

    // PumpMessagesToConsole(autoRest);
    const view = await autoRest.view;
    assert.equal(await autoRest.Process().finish, true);

    const keys = Object.keys((<any>view.DataStore).store);
    const composed = keys.filter(x => x.endsWith('swagger-document'))[0];

    // regular description
    {
      const blameTree = await view.DataStore.Blame(
        composed,
        { path: parse('$.securityDefinitions.azure_auth.description') });
      const blameInputs = blameTree.BlameLeafs();
      assert.equal(blameInputs.length, 1);
    }

    // markdown description (blames both the swagger's json path and the markdown source of the description)
    {
      const blameTree = await view.DataStore.Blame(
        composed,
        { path: parse('$.definitions.SearchServiceListResult.description') });
      const blameInputs = blameTree.BlameLeafs();
      assert.equal(blameInputs.length, 1);
      // assert.equal(blameInputs.length, 2); // TODO: blame configuration file segments!
    }

    // path with existent node in path
    {
      const msg = {
        Text: 'Phoney message to test', Channel: Channel.Warning, Source: [<SourceLocation>
          {
            document: composed,
            Position: <EnhancedPosition>{ path: parse('$.paths["/subscriptions/{subscriptionId}/resourceGroups/{resourceGroupName}/providers/Microsoft.Search/searchServices/{serviceName}"]') }
          }]
      };
      view.Message(msg);
      assert.equal((<Array<string>>msg.Source[0].Position.path).length, 2);
    }

    // path node non existent
    {
      const msg = {
        Text: 'Phoney message to test', Channel: Channel.Warning, Source: [<SourceLocation>
          {
            document: composed,
            Position: <EnhancedPosition>{ path: parse('$.paths["/subscriptions/{subscriptionId}/resourceGroups/{resourceGroupName}/providers/Microsoft.Search/searchServices/{serviceName}"].get') }
          }]
      };
      view.Message(msg);
      assert.equal((<Array<string>>msg.Source[0].Position.path).length, 2);
    }
  }

  // gs01/nelson : to do -- we have to come back and make sure this works.
  /* @test */ async 'generate resolved swagger with source map'() {
    const autoRest = new AutoRest(new RealFileSystem(), ResolveUri(CreateFolderUri(__dirname), '../../test/resources/small-input/'));
    autoRest.AddConfiguration({ 'output-artifact': ['swagger-document', 'swagger-document.map'] });
    const files: Array<Artifact> = [];
    autoRest.GeneratedFile.Subscribe((_, a) => files.push(a));
    assert.equal(await autoRest.Process().finish, true);
    assert.strictEqual(files.length, 2);

    // briefly inspect source map
    const sourceMap = files.filter(x => x.type === 'swagger-document.map')[0].content;
    const sourceMapObj = JSON.parse(sourceMap);
    assert.ok(sourceMap.length > 100000);
    assert.ok(sourceMapObj.mappings.split(';').length > 1000);
  }

  @test async 'large swagger performance'() {
    const autoRest = new AutoRest(new RealFileSystem(), ResolveUri(CreateFolderUri(__dirname), '../../test/resources/large-input/'));
    autoRest.AddConfiguration({ 'output-artifact': ['swagger-document', 'swagger-document.map'] });
    const messages: Array<Message> = [];
    autoRest.Message.Subscribe((_, m) => messages.push(m));
    assert.equal(await autoRest.Process().finish, true);
    assert.notEqual(messages.length, 0);
  }

  static after() {
    Configuration.shutdown();
  }
}
