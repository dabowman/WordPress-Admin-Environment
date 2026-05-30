import assert from 'node:assert';
import test from 'node:test';
import {
	autosaveTarget,
	PARENT_AUTOSAVE_STATUSES,
} from '../../src/apps/simple-editor/autosave.mjs';

test( 'draft-like statuses autosave to the parent record', () => {
	for ( const status of [ 'draft', 'auto-draft' ] ) {
		assert.equal(
			autosaveTarget( status ),
			'parent',
			`${ status } should update the parent record`
		);
	}
} );

test( 'pending / published / private / scheduled route to the autosaves endpoint', () => {
	// Core's autosaves controller only updates the parent in place for
	// draft/auto-draft; pending (and everything above it) gets a per-user
	// revision, so the live/under-review record is never PUT by a debounce.
	for ( const status of [ 'pending', 'publish', 'private', 'future' ] ) {
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
	assert.deepEqual( PARENT_AUTOSAVE_STATUSES, [ 'draft', 'auto-draft' ] );
} );
