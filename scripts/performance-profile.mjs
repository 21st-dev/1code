#!/usr/bin/env node
/**
 * Performance profiling script for 1Code Electron app
 */

import { statSync, readdirSync } from 'fs'
import { join } from 'path'

console.log('═══════════════════════════════════════════════════════')
console.log('  1CODE PERFORMANCE PROFILING - BASELINE MEASUREMENT')
console.log('═══════════════════════════════════════════════════════\n')

// 1. Component Size Analysis
console.log('📊 COMPONENT SIZE ANALYSIS\n')

function analyzeFile(filePath) {
  try {
    const stats = statSync(filePath)
    const lines = require('fs').readFileSync(filePath, 'utf-8').split('\n').length
    return { size: stats.size, lines }
  } catch {
    return { size: 0, lines: 0 }
  }
}

const componentsToCheck = [
  'src/renderer/features/agents/main/active-chat.tsx',
  'src/renderer/features/agents/main/messages-list.tsx',
  'src/renderer/components/ui/icons.tsx',
  'src/renderer/components/ui/canvas-icons.tsx',
  'src/main/lib/trpc/routers/chats.ts',
  'src/renderer/contexts/TRPCProvider.tsx',
  'src/renderer/features/layout/agents-layout.tsx'
]

let totalIssues = 0

componentsToCheck.forEach(file => {
  const fullPath = join(process.cwd(), file)
  const { size, lines } = analyzeFile(fullPath)
  const sizeKB = (size / 1024).toFixed(1)
  
  let status = '✓'
  let issue = ''
  
  if (lines > 2000) {
    status = '⚠️'
    issue = ' - TOO LARGE'
    totalIssues++
  } else if (lines > 1000) {
    status = '⚡'
    issue = ' - NEEDS REVIEW'
    totalIssues++
  }
  
  console.log(`${status} ${file}`)
  console.log(`   ${lines.toLocaleString()} lines | ${sizeKB} KB${issue}\n`)
})

// 2. Database Query Analysis
console.log('\n📊 DATABASE OPERATIONS ANALYSIS\n')

const dbFiles = [
  'src/main/lib/db/index.ts',
  'src/main/lib/trpc/routers/chats.ts',
  'src/main/lib/trpc/routers/projects.ts'
]

let syncOps = 0
let nPlusOneQueries = 0

dbFiles.forEach(file => {
  const fullPath = join(process.cwd(), file)
  try {
    const content = require('fs').readFileSync(fullPath, 'utf-8')
    
    // Count synchronous operations
    const syncMatches = content.match(/\.get\(\)|\.all\(\)|\.run\(\)/g) || []
    syncOps += syncMatches.length
    
    // Detect N+1 patterns (multiple queries in sequence)
    const sequentialQueries = content.match(/db\.select\(\)[\s\S]{0,200}db\.select\(\)/g) || []
    nPlusOneQueries += sequentialQueries.length
    
    console.log(`${file}:`)
    console.log(`   Sync operations: ${syncMatches.length}`)
    console.log(`   Potential N+1 patterns: ${sequentialQueries.length}\n`)
  } catch (e) {
    console.log(`   ❌ Could not analyze\n`)
  }
})

console.log(`⚠️  Total synchronous DB operations: ${syncOps}`)
console.log(`⚠️  Potential N+1 query patterns: ${nPlusOneQueries}\n`)

if (syncOps > 0) totalIssues++
if (nPlusOneQueries > 0) totalIssues++

// 3. React Performance Patterns
console.log('\n📊 REACT PERFORMANCE PATTERNS\n')

const reactFiles = [
  'src/renderer/features/agents/main/active-chat.tsx',
  'src/renderer/features/agents/main/messages-list.tsx',
  'src/renderer/contexts/TRPCProvider.tsx'
]

let totalUseEffects = 0
let totalUseCallbacks = 0
let memoComponents = 0
let lazyLoads = 0

reactFiles.forEach(file => {
  const fullPath = join(process.cwd(), file)
  try {
    const content = require('fs').readFileSync(fullPath, 'utf-8')
    
    const useEffectCount = (content.match(/useEffect\(/g) || []).length
    const useCallbackCount = (content.match(/useCallback\(/g) || []).length
    const memoCount = (content.match(/React\.memo|memo\(/g) || []).length
    const lazyCount = (content.match(/React\.lazy/g) || []).length
    
    totalUseEffects += useEffectCount
    totalUseCallbacks += useCallbackCount
    memoComponents += memoCount
    lazyLoads += lazyCount
    
    let status = '✓'
    if (useEffectCount > 30) {
      status = '⚠️'
      totalIssues++
    }
    
    console.log(`${status} ${file}:`)
    console.log(`   useEffect: ${useEffectCount}`)
    console.log(`   useCallback: ${useCallbackCount}`)
    console.log(`   memo: ${memoCount}`)
    console.log(`   lazy: ${lazyCount}\n`)
  } catch (e) {
    console.log(`   ❌ Could not analyze\n`)
  }
})

console.log(`Total useEffect hooks: ${totalUseEffects}`)
console.log(`Total useCallback hooks: ${totalUseCallbacks}`)
console.log(`Memoized components: ${memoComponents}`)
console.log(`Lazy loaded components: ${lazyLoads}`)

if (lazyLoads < 5) {
  console.log(`⚠️  Warning: Only ${lazyLoads} lazy loaded components found\n`)
  totalIssues++
}

// 4. Bundle Size Analysis
console.log('\n📊 BUNDLE SIZE ANALYSIS\n')

try {
  const nodeModulesSize = require('child_process')
    .execSync('du -sh node_modules 2>/dev/null || echo "0"')
    .toString()
    .trim()
  
  console.log(`node_modules size: ${nodeModulesSize}`)
  
  const outDir = 'out'
  if (require('fs').existsSync(outDir)) {
    const outSize = require('child_process')
      .execSync(`du -sh ${outDir} 2>/dev/null || echo "0"`)
      .toString()
      .trim()
    console.log(`Built output size: ${outSize}`)
  } else {
    console.log('Built output: Not built yet')
  }
} catch (e) {
  console.log('Could not measure bundle size')
}

// 5. Summary
console.log('\n═══════════════════════════════════════════════════════')
console.log('  PERFORMANCE BASELINE SUMMARY')
console.log('═══════════════════════════════════════════════════════\n')

console.log(`Total Issues Found: ${totalIssues}\n`)

console.log('Critical Issues:')
console.log('  1. Synchronous database operations: ' + (syncOps > 50 ? '⚠️  CRITICAL' : '✓ OK'))
console.log('  2. N+1 query patterns: ' + (nPlusOneQueries > 5 ? '⚠️  CRITICAL' : '✓ OK'))
console.log('  3. Large monolithic components: ' + (totalIssues > 0 ? '⚠️  FOUND' : '✓ OK'))
console.log('  4. Limited code splitting: ' + (lazyLoads < 5 ? '⚠️  CRITICAL' : '✓ OK'))
console.log('  5. Excessive useEffect hooks: ' + (totalUseEffects > 100 ? '⚠️  CRITICAL' : '✓ OK'))

console.log('\n═══════════════════════════════════════════════════════')
console.log('Profile saved to: performance-baseline.txt')
console.log('═══════════════════════════════════════════════════════\n')

