// Store last assessment
const STORAGE_KEY = 'repoready_last_assessment';

// Function to fetch from GitHub (no CORS issues with raw content)
async function fetchFromGitHub(owner, repo, path) {
    const url = `https://raw.githubusercontent.com/${owner}/${repo}/main/${path}`;
    const fallbackUrl = `https://raw.githubusercontent.com/${owner}/${repo}/master/${path}`;
    
    try {
        const response = await fetch(url);
        if (response.ok) {
            return await response.text();
        }
        const fallbackResponse = await fetch(fallbackUrl);
        if (fallbackResponse.ok) {
            return await fallbackResponse.text();
        }
        return null;
    } catch (e) {
        return null;
    }
}

// Function to check if a path exists
async function pathExists(owner, repo, path) {
    const content = await fetchFromGitHub(owner, repo, path);
    return content !== null;
}

// Function to fetch directory listing from GitHub API
async function fetchDirectory(owner, repo) {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents`;
    try {
        const response = await fetch(url);
        if (response.ok) {
            return await response.json();
        }
        return [];
    } catch (e) {
        return [];
    }
}

// Function to fetch tags
async function fetchTags(owner, repo) {
    const url = `https://api.github.com/repos/${owner}/${repo}/tags`;
    try {
        const response = await fetch(url);
        if (response.ok) {
            return await response.json();
        }
        return [];
    } catch (e) {
        return [];
    }
}

// Main assessment function
async function assessRepository(owner, repo) {
    try {
        // Check if repository exists first
        const repoCheckUrl = `https://api.github.com/repos/${owner}/${repo}`;
        const repoCheck = await fetch(repoCheckUrl);
        if (!repoCheck.ok) {
            throw new Error(`Repository "${owner}/${repo}" not found`);
        }
        
        // Fetch README
        let readmeContent = await fetchFromGitHub(owner, repo, 'README.md');
        if (!readmeContent) {
            readmeContent = await fetchFromGitHub(owner, repo, 'README');
        }
        
        // Fetch LICENSE
        let hasLicense = false;
        let licenseContent = '';
        const licenseContent_ = await fetchFromGitHub(owner, repo, 'LICENSE');
        if (licenseContent_) {
            hasLicense = true;
            licenseContent = licenseContent_;
        } else {
            const licenseMdContent = await fetchFromGitHub(owner, repo, 'LICENSE.md');
            if (licenseMdContent) {
                hasLicense = true;
                licenseContent = licenseMdContent;
            }
        }
        
        // Fetch directory contents to check for tests
        let hasTests = false;
        let testFiles = [];
        const contents = await fetchDirectory(owner, repo);
        if (Array.isArray(contents)) {
            for (const item of contents) {
                if (item.type === 'dir' && /test|tests?/i.test(item.name)) {
                    hasTests = true;
                    testFiles.push(item.name);
                }
                if (item.type === 'file' && /test|spec/i.test(item.name)) {
                    hasTests = true;
                    testFiles.push(item.name);
                }
            }
        }
        
        // Check for CI files
        let hasCI = false;
        let ciType = null;
        const ciFiles = [
            '.github/workflows/ci.yml',
            '.github/workflows/test.yml',
            '.gitlab-ci.yml',
            '.travis.yml'
        ];
        
        for (const ciFile of ciFiles) {
            if (await pathExists(owner, repo, ciFile)) {
                hasCI = true;
                ciType = ciFile.includes('github') ? 'GitHub Actions' : 
                         ciFile.includes('gitlab') ? 'GitLab CI' : 'CI/CD';
                break;
            }
        }
        
        // Check for CITATION.cff
        const hasCitation = await pathExists(owner, repo, 'CITATION.cff');
        
        // Fetch tags
        const tags = await fetchTags(owner, repo);
        
        // Check for code quality files
        let hasCodeQuality = false;
        const qualityFiles = ['pyproject.toml', '.prettierrc', '.eslintrc', 'setup.py'];
        for (const qFile of qualityFiles) {
            if (await pathExists(owner, repo, qFile)) {
                hasCodeQuality = true;
                break;
            }
        }
        
        // Evaluate each category
        const readmeEval = evaluateReadme(readmeContent);
        const licenseEval = evaluateLicense(hasLicense, licenseContent);
        const testsEval = evaluateTests(hasTests, testFiles);
        const ciEval = evaluateCI(hasCI, ciType);
        const versioningEval = evaluateVersioning(tags);
        const citationEval = evaluateCitation(hasCitation, readmeContent);
        const codeQualityEval = evaluateCodeQuality(hasCodeQuality);
        
        // Total score
        const totalScore = readmeEval.score + licenseEval.score + testsEval.score + 
                          ciEval.score + versioningEval.score + citationEval.score + codeQualityEval.score;
        
        // Generate fixes with ALL priorities
        const fixes = [];
        
        // HIGH PRIORITY
        if (licenseEval.score < 20) {
            fixes.push({
                task: "❌ Add a LICENSE file to the root directory (e.g., MIT, Apache-2.0)",
                impact: "CRITICAL: LEGAL REQUIREMENT FOR DISTRIBUTION AND REUSE",
                priority: "HIGH"
            });
        }
        
        if (testsEval.score === 0) {
            fixes.push({
                task: "❌ Implement a basic test suite and tests directory",
                impact: "HIGH: ENSURES SCIENTIFIC INTEGRITY AND PREVENTS REGRESSIONS",
                priority: "HIGH"
            });
        } else if (testsEval.score > 0 && testsEval.score < 20) {
            fixes.push({
                task: "⚠️ Expand test coverage to include more comprehensive test cases",
                impact: "HIGH: CURRENT TESTS ARE LIMITED",
                priority: "HIGH"
            });
        }
        
        // MEDIUM PRIORITY
        if (ciEval.score === 0) {
            fixes.push({
                task: "⚠️ Configure GitHub Actions (.github/workflows) to automate tests",
                impact: "MEDIUM: INCREASES STABILITY AND TRUST IN THE REPOSITORY",
                priority: "MEDIUM"
            });
        }
        
        if (citationEval.score === 0) {
            fixes.push({
                task: "⚠️ Create a CITATION.cff file to allow researchers to easily cite this repository",
                impact: "MEDIUM: IMPROVES ACADEMIC IMPACT TRACKING",
                priority: "MEDIUM"
            });
        } else if (citationEval.score > 0 && citationEval.score < 10) {
            fixes.push({
                task: "📝 Improve citation information by adding a CITATION.cff file",
                impact: "MEDIUM: CURRENT CITATION INFO IS INCOMPLETE",
                priority: "MEDIUM"
            });
        }
        
        if (readmeEval.score === 0) {
            fixes.push({
                task: "📖 Create a README file with installation, usage, and project overview",
                impact: "MEDIUM: ESSENTIAL FOR PROJECT DOCUMENTATION",
                priority: "MEDIUM"
            });
        } else if (readmeEval.score > 0 && readmeEval.score < 20) {
            fixes.push({
                task: "📖 Enhance README documentation with installation and usage examples",
                impact: "MEDIUM: IMPROVES ONSET AND USABILITY",
                priority: "MEDIUM"
            });
        }
        
        if (versioningEval.score === 0) {
            fixes.push({
                task: "🏷️ Create version tags for releases (e.g., v1.0.0, v1.0.1)",
                impact: "MEDIUM: IMPORTANT FOR REPRODUCIBILITY",
                priority: "MEDIUM"
            });
        } else if (versioningEval.score > 0 && versioningEval.score < 8) {
            fixes.push({
                task: "🏷️ Adopt semantic versioning format (v1.0.0, v1.0.1, etc.)",
                impact: "LOW: CURRENT TAGS NOT FOLLOWING SEMVER",
                priority: "LOW"
            });
        }
        
        // LOW PRIORITY
        if (!hasCodeQuality) {
            fixes.push({
                task: "🎨 Add code formatting configuration (.prettierrc, .eslintrc, or pyproject.toml)",
                impact: "LOW: IMPROVES CODE READABILITY AND MAINTAINABILITY",
                priority: "LOW"
            });
        }
        
        if (readmeEval.score >= 20 && readmeEval.score < 25) {
            fixes.push({
                task: "📝 Add more details to README (structure overview, documentation links)",
                impact: "LOW: MISSING SOME DOCUMENTATION SECTIONS",
                priority: "LOW"
            });
        }
        
        const checks = [
            {
                label: "README Quality",
                passed: readmeEval.score >= 20,
                score: readmeEval.score,
                maxScore: 25,
                rationale: readmeEval.reason,
                impact: "medium"
            },
            {
                label: "License",
                passed: licenseEval.score >= 15,
                score: licenseEval.score,
                maxScore: 20,
                rationale: licenseEval.reason,
                impact: "high"
            },
            {
                label: "Tests",
                passed: testsEval.score >= 15,
                score: testsEval.score,
                maxScore: 20,
                rationale: testsEval.reason,
                impact: "high"
            },
            {
                label: "CI Config",
                passed: ciEval.score >= 10,
                score: ciEval.score,
                maxScore: 15,
                rationale: ciEval.reason,
                impact: "medium"
            },
            {
                label: "Versioning",
                passed: versioningEval.score >= 8,
                score: versioningEval.score,
                maxScore: 10,
                rationale: versioningEval.reason,
                impact: "medium"
            },
            {
                label: "Citation",
                passed: citationEval.score >= 8,
                score: citationEval.score,
                maxScore: 10,
                rationale: citationEval.reason,
                impact: "medium"
            },
            {
                label: "Code Quality & Formatting",
                passed: codeQualityEval.score >= 10,
                score: codeQualityEval.score,
                maxScore: 15,
                rationale: codeQualityEval.reason,
                impact: "low"
            }
        ];
        
        const summary = generateSummary(readmeEval, licenseEval, testsEval, ciEval, versioningEval, citationEval, totalScore);
        
        return {
            repository: `${owner}/${repo}`,
            url: `https://github.com/${owner}/${repo}`,
            overallScore: totalScore,
            rating: getRating(totalScore),
            summary: summary,
            checks: checks,
            fixes: fixes,
            timestamp: new Date().toLocaleString()
        };
        
    } catch (error) {
        console.error('Assessment error:', error);
        throw error;
    }
}

function evaluateReadme(content) {
    if (!content) {
        return { score: 0, reason: 'No README file detected in the root directory.' };
    }
    let score = 0;
    if (/install|setup|getting started|installation|pip install|npm install/i.test(content)) score += 10;
    if (/run|usage|example|quick start|how to use|command/i.test(content)) score += 10;
    if (/structure|organization|overview/i.test(content)) score += 5;
    
    let reason = '';
    if (score >= 25) {
        reason = 'The README is professionally structured with clear navigation and comprehensive documentation.';
    } else if (score >= 15) {
        reason = 'README contains essential information but could benefit from more detailed setup guides.';
    } else if (score > 0) {
        reason = 'README exists but lacks critical setup or usage instructions.';
    } else {
        reason = 'No README file detected in the root directory.';
    }
    return { score: Math.min(score, 25), reason };
}

function evaluateLicense(hasLicense, content) {
    if (!hasLicense) {
        return { score: 0, reason: 'No LICENSE file was detected in the root directory. A license is mandatory for legal reuse in research and industry.' };
    }
    const isOpenSource = /MIT|Apache|GPL|BSD|MPL|LGPL/i.test(content || '');
    if (isOpenSource) {
        return { score: 20, reason: 'Open source license detected. This enables legal reuse and distribution.' };
    }
    return { score: 10, reason: 'License present but not a standard open-source license. Consider using MIT, Apache-2.0, or GPL.' };
}

function evaluateTests(hasTests, testFiles) {
    if (!hasTests) {
        return { score: 0, reason: 'No test directories or test configuration files were detected. Research software requires verification suites to ensure implementation accuracy.' };
    }
    return { score: 20, reason: `Test infrastructure detected: ${testFiles.join(', ')}. This ensures scientific integrity.` };
}

function evaluateCI(hasCI, ciType) {
    if (!hasCI) {
        return { score: 0, reason: 'No GitHub Actions, GitLab CI, or other CI/CD workflows detected. Automated testing is essential for maintaining repository reliability.' };
    }
    return { score: 15, reason: `${ciType} workflow detected. This enables automated testing and continuous integration.` };
}

function evaluateVersioning(tags) {
    if (!tags || tags.length === 0) {
        return { score: 0, reason: 'No release tags detected. Versioning is important for reproducibility and tracking changes.' };
    }
    const semanticVersions = tags.filter(t => /^v?\d+\.\d+\.\d+/.test(t.name));
    if (semanticVersions.length > 0) {
        return { score: 10, reason: `The project maintains excellent versioning with ${semanticVersions.length} release tag(s) following semantic versioning.` };
    }
    return { score: 5, reason: `${tags.length} release tag(s) detected. Consider adopting semantic versioning (v1.0.0 format).` };
}

function evaluateCitation(hasCitationFile, readmeContent) {
    if (hasCitationFile) {
        return { score: 10, reason: 'CITATION.cff file detected, enabling standardized academic attribution.' };
    }
    if (readmeContent && /citation|how to cite|reference|bibtex|doi/i.test(readmeContent)) {
        return { score: 7, reason: 'Citation information found in README. Consider adding a CITATION.cff file for better integration with academic tools.' };
    }
    return { score: 0, reason: 'No CITATION.cff file or citation information detected. This makes it difficult for researchers to properly cite your work.' };
}

function evaluateCodeQuality(hasConfig) {
    if (!hasConfig) {
        return { score: 0, reason: 'No explicit formatting configurations (like Black, Prettier, or ESLint) were found. Project relies on manual or external style enforcement.' };
    }
    return { score: 15, reason: 'Code formatting configurations detected. This improves code readability and maintainability.' };
}

function getRating(score) {
    if (score >= 85) return 'EXCELLENT - Research Software Ready';
    if (score >= 70) return 'GOOD - Mostly Ready';
    if (score >= 50) return 'FAIR - Needs Improvement';
    if (score >= 30) return 'POOR - Significant Work Needed';
    return 'CRITICAL - Not Ready for Research Use';
}

function generateSummary(readme, license, tests, ci, versioning, citation, totalScore) {
    const goodPoints = [];
    const badPoints = [];
    
    if (readme.score >= 20) goodPoints.push('professional README documentation');
    else if (readme.score > 0) badPoints.push('incomplete README documentation');
    else badPoints.push('missing README');
    
    if (license.score >= 15) goodPoints.push('proper licensing');
    else if (license.score > 0) badPoints.push('non-standard license');
    else badPoints.push('missing LICENSE file');
    
    if (tests.score >= 15) goodPoints.push('comprehensive test suites');
    else if (tests.score > 0) badPoints.push('limited test coverage');
    else badPoints.push('no test suite');
    
    if (ci.score >= 10) goodPoints.push('CI/CD automation');
    else badPoints.push('no CI/CD configuration');
    
    if (versioning.score >= 8) goodPoints.push('robust versioning practices');
    else if (versioning.score > 0) badPoints.push('inconsistent versioning');
    else badPoints.push('no version tags');
    
    if (citation.score >= 8) goodPoints.push('proper citation metadata');
    else badPoints.push('missing citation information');
    
    let summary = '';
    if (goodPoints.length > 0) {
        summary += `The repository exhibits ${goodPoints.join(', ')}. `;
    }
    if (badPoints.length > 0) {
        summary += `However, it fails several core 'research-readiness' benchmarks due to ${badPoints.join(', ')}. `;
        summary += `These omissions create significant barriers for academic reuse, verification, and legal compliance.`;
    } else if (goodPoints.length > 0) {
        summary += `These practices create a solid foundation for research software.`;
    } else {
        summary += `The repository needs significant improvements to meet research software standards.`;
    }
    return summary;
}

function generateHTMLReport(assessment) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>RepoReady Report - ${assessment.repository}</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #E4E3E0; padding: 40px; }
        .container { max-width: 800px; margin: 0 auto; background: white; padding: 40px; border: 1px solid #141414; }
        h1 { text-transform: uppercase; border-bottom: 2px solid #141414; padding-bottom: 10px; }
        .score-box { font-size: 48px; font-weight: bold; margin: 20px 0; }
        .summary { font-style: italic; margin-bottom: 30px; color: #444; }
        .check-item { border-bottom: 1px solid #eee; padding: 15px 0; }
        .check-header { display: flex; justify-content: space-between; font-weight: bold; }
        .status-passed { color: #059669; }
        .status-failed { color: #dc2626; }
        .rationale { font-size: 14px; color: #666; margin-top: 5px; }
        .fix-list { background: #f9f9f9; padding: 20px; border: 1px dashed #141414; margin-top: 30px; }
        .fix-item { margin-bottom: 15px; padding: 10px; border-left: 3px solid; }
        .fix-item.HIGH { border-left-color: #dc2626; }
        .fix-item.MEDIUM { border-left-color: #f59e0b; }
        .fix-item.LOW { border-left-color: #10b981; }
        .priority-high { color: #dc2626; font-weight: bold; }
