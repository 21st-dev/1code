/**
 * Research Repository Configuration
 * Provides access to Tsukieomie's research repository ecosystem for analysis
 */

export interface ResearchRepo {
  name: string;
  owner: string;
  fullName: string;
  description: string;
  language: string | null;
  topics: string[];
  category: 'code' | 'documentation' | 'research' | 'config';
  url: string;
  cloneUrl: string;
}

export interface RepoEcosystem {
  owner: string;
  repos: ResearchRepo[];
  relationships: RepoRelationship[];
}

export interface RepoRelationship {
  from: string;
  to: string;
  type: 'references' | 'extends' | 'uses' | 'documents';
}

/**
 * Tsukieomie Research Repository Ecosystem
 */
export const RESEARCH_REPOS: ResearchRepo[] = [
  {
    name: 'EEG2013',
    owner: 'Tsukieomie',
    fullName: 'Tsukieomie/EEG2013',
    description: 'Comprehensive EEG-RF research documentation covering fundamentals, detection methods, patents, and historical context',
    language: null,
    topics: ['eeg', 'rf-research', 'neuroscience', 'documentation', 'patents'],
    category: 'documentation',
    url: 'https://github.com/Tsukieomie/EEG2013',
    cloneUrl: 'https://github.com/Tsukieomie/EEG2013.git',
  },
  {
    name: '1code',
    owner: 'Tsukieomie',
    fullName: 'Tsukieomie/1code',
    description: 'Best UI for Claude Code - Electron-based desktop application',
    language: 'TypeScript',
    topics: ['electron', 'typescript', 'claude', 'ai', 'desktop-app'],
    category: 'code',
    url: 'https://github.com/Tsukieomie/1code',
    cloneUrl: 'https://github.com/Tsukieomie/1code.git',
  },
  {
    name: 'RF-Brain-Research',
    owner: 'Tsukieomie',
    fullName: 'Tsukieomie/RF-Brain-Research',
    description: 'Research documentation on RF-brain interaction, reradiation detection, and neural monitoring',
    language: 'Python',
    topics: ['rf', 'brain-research', 'neural-monitoring', 'sdr', 'research'],
    category: 'research',
    url: 'https://github.com/Tsukieomie/RF-Brain-Research',
    cloneUrl: 'https://github.com/Tsukieomie/RF-Brain-Research.git',
  },
  {
    name: 'rf-brainwave-detection',
    owner: 'Tsukieomie',
    fullName: 'Tsukieomie/rf-brainwave-detection',
    description: 'Passive RF detection of brainwave signals using HackRF - Based on Malech Patent US3951134A',
    language: 'Python',
    topics: ['hackrf', 'sdr', 'brainwave', 'rf-detection', 'signal-processing', 'python'],
    category: 'code',
    url: 'https://github.com/Tsukieomie/rf-brainwave-detection',
    cloneUrl: 'https://github.com/Tsukieomie/rf-brainwave-detection.git',
  },
  {
    name: 'cia-psychic-research',
    owner: 'Tsukieomie',
    fullName: 'Tsukieomie/cia-psychic-research',
    description: 'Historical documentation on CIA programs including MKUltra and Project Stargate',
    language: null,
    topics: ['history', 'mkultra', 'stargate', 'declassified', 'research'],
    category: 'documentation',
    url: 'https://github.com/Tsukieomie/cia-psychic-research',
    cloneUrl: 'https://github.com/Tsukieomie/cia-psychic-research.git',
  },
  {
    name: 'Tsukiomie',
    owner: 'Tsukieomie',
    fullName: 'Tsukieomie/Tsukiomie',
    description: 'Profile/configuration repository - Hub for ecosystem documentation and setup scripts',
    language: 'Shell',
    topics: ['config', 'setup', 'shell', 'mcp', 'automation'],
    category: 'config',
    url: 'https://github.com/Tsukieomie/Tsukiomie',
    cloneUrl: 'https://github.com/Tsukieomie/Tsukiomie.git',
  },
];

/**
 * Repository relationships defining how repos connect
 */
export const REPO_RELATIONSHIPS: RepoRelationship[] = [
  { from: 'Tsukiomie', to: 'EEG2013', type: 'references' },
  { from: 'Tsukiomie', to: 'rf-brainwave-detection', type: 'references' },
  { from: 'Tsukiomie', to: 'RF-Brain-Research', type: 'references' },
  { from: 'Tsukiomie', to: 'cia-psychic-research', type: 'references' },
  { from: 'RF-Brain-Research', to: 'EEG2013', type: 'extends' },
  { from: 'rf-brainwave-detection', to: 'RF-Brain-Research', type: 'uses' },
  { from: 'EEG2013', to: 'cia-psychic-research', type: 'references' },
];

/**
 * Get the full ecosystem configuration
 */
export function getResearchEcosystem(): RepoEcosystem {
  return {
    owner: 'Tsukieomie',
    repos: RESEARCH_REPOS,
    relationships: REPO_RELATIONSHIPS,
  };
}

/**
 * Get repos by category
 */
export function getReposByCategory(category: ResearchRepo['category']): ResearchRepo[] {
  return RESEARCH_REPOS.filter(repo => repo.category === category);
}

/**
 * Get repos by language
 */
export function getReposByLanguage(language: string): ResearchRepo[] {
  return RESEARCH_REPOS.filter(repo => repo.language === language);
}

/**
 * Get related repos for a given repo
 */
export function getRelatedRepos(repoName: string): { repo: ResearchRepo; relationship: string }[] {
  const related: { repo: ResearchRepo; relationship: string }[] = [];

  for (const rel of REPO_RELATIONSHIPS) {
    if (rel.from === repoName) {
      const repo = RESEARCH_REPOS.find(r => r.name === rel.to);
      if (repo) {
        related.push({ repo, relationship: `${rel.type} ${rel.to}` });
      }
    }
    if (rel.to === repoName) {
      const repo = RESEARCH_REPOS.find(r => r.name === rel.from);
      if (repo) {
        related.push({ repo, relationship: `referenced by ${rel.from}` });
      }
    }
  }

  return related;
}

/**
 * Search repos by topic
 */
export function searchReposByTopic(topic: string): ResearchRepo[] {
  const lowerTopic = topic.toLowerCase();
  return RESEARCH_REPOS.filter(repo =>
    repo.topics.some(t => t.toLowerCase().includes(lowerTopic))
  );
}
