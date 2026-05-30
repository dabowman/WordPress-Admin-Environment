import assert from 'node:assert';
import test from 'node:test';
import {
	autosaveTarget,
	PARENT_AUTOSAVE_STATUSES,
} from '../../src/apps/simple-editor/autosave.mjs';

test( 'draft-like statuses autosave to the parent record', () => {
	for ( const status of [ 'draft', 'auto-draft', 'pending' ] ) {
		assert.equal(
			autosaveTarget( status ),
			'parent',
			`${ status } should update the parent record`
		);
	}
} );

test( 'published / private / scheduled route to the autosaves endpoint', () => {
	for ( const status of [ 'publish', 'private', 'future' ] ) {
		assert.equal(
			autosaveTarget( status ),
			'autosave',
			`${ status } must never PUT the live record`
		);
	}
} );

test( 'unknown / missing status defaults to the safe autosave path', () => {
	// Fail closed: anything we don't explicitly recognise as draft-like is
	// treated as a live record we must not clobber.
	assert.equal( autosaveTarget( undefined ), 'autosave' );
	assert.equal( autosaveTarget( '' ), 'autosave' );
	assert.equal( autosaveTarget( 'trash' ), 'autosave' );
} );

test( 'PARENT_AUTOSAVE_STATUSES is the draft-like set', () => {
	assert.deepEqual( PARENT_AUTOSAVE_STATUSES, [
		'draft',
		'auto-draft',
		'pending',
	] );
} );
