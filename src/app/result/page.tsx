import React, { Suspense } from 'react';
import ResultClient from './result.client';

export default function Page() {
	return (
		<Suspense fallback={<div />}> 
			<ResultClient />
		</Suspense>
	);
}

