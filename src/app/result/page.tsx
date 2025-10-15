import React, { Suspense } from 'react'
import ResultClient from './result.client'

export default function ResultPageServer() {
  return (
    <Suspense fallback={<div className="min-h-dvh w-full bg-white" />}>
      <ResultClient />
    </Suspense>
  )
}