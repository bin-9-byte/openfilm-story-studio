import {test} from 'node:test';import assert from 'node:assert/strict';
import {createHistorySessions} from './history-session.ts';
import {moveStep,pushStep,nextStep} from './steps.ts';
test('project navigation preserves independent undo and redo stacks without creating history entries',()=>{
 const sessions=createHistorySessions<string>();
 sessions.set('root',pushStep(sessions.get('root'),'edit script'));
 sessions.set('scene',pushStep(sessions.get('scene'),'trim shot'));
 assert.equal(nextStep(sessions.get('root'),'undo'),'edit script');assert.equal(nextStep(sessions.get('scene'),'undo'),'trim shot');
 sessions.set('root',moveStep(sessions.get('root'),'edit script','undo'));
 assert.equal(nextStep(sessions.get('root'),'redo'),'edit script');assert.equal(nextStep(sessions.get('scene'),'undo'),'trim shot');
});
test('session history cache evicts least-recent project at its bound',()=>{
 const sessions=createHistorySessions<string>(2);sessions.set('a',{done:['a'],undone:[]});sessions.set('b',{done:['b'],undone:[]});sessions.get('a');sessions.set('c',{done:['c'],undone:[]});assert.deepEqual(sessions.get('b'),{done:[],undone:[]});assert.equal(nextStep(sessions.get('a'),'undo'),'a');
});
