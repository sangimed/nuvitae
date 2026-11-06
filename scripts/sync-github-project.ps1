#requires -Version 5.1
<#
.SYNOPSIS
Synchronise les 4 vues du GitHub Project Nuvitae existant.

.DESCRIPTION
Lecture seule par defaut. Utiliser -Apply pour ajouter les cartes absentes et
creer/mettre a jour les vues nommees. Ne cree aucun Project, ne supprime aucun
element et ne modifie aucun statut d'issue/PR.
Prerequis : GitHub CLI (gh) authentifie avec le scope "project".

.EXAMPLE
.\scripts\sync-github-project.ps1

.EXAMPLE
.\scripts\sync-github-project.ps1 -Apply

.EXAMPLE
.\scripts\sync-github-project.ps1 -Owner sangimed -ProjectNumber 2 -Apply
#>
[CmdletBinding()]
param(
    [string] $Owner = 'sangimed',
    [string] $Repo = 'sangimed/nuvitae',
    [int] $ProjectNumber = 0,
    [switch] $Apply,
    [switch] $SkipItems,
    [switch] $SelfTest
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Normalize-ProjectViewFilter {
    param([AllowNull()][string] $Value)

    if ([string]::IsNullOrWhiteSpace($Value)) { return '' }

    # GitHub may omit optional quotes around single-token label values.
    # Keep quotes around values containing spaces or commas.
    $withoutOptionalQuotes = $Value.Trim() -replace '"([^"\s,]+)"', '$1'
    return ($withoutOptionalQuotes -replace '\s+', ' ').Trim()
}

function Test-ProjectViewMatches {
    param([object] $View, [object] $Spec)

    if ($null -eq $View) { return $false }
    $sameLayout = ([string] $View.layout -eq [string] $Spec.Layout)
    $sameFilter = ((Normalize-ProjectViewFilter -Value $View.filter) -ceq
                   (Normalize-ProjectViewFilter -Value $Spec.Filter))
    return ($sameLayout -and $sameFilter)
}

if ($SelfTest) {
    $tests = @(
        @{ Actual = 'repo:sangimed/nuvitae is:issue is:open label:horizon:now'
           Expected = 'repo:sangimed/nuvitae is:issue is:open label:"horizon:now"'
           Match = $true },
        @{ Actual = 'repo:sangimed/nuvitae  is:issue    is:open  label:"horizon:now"'
           Expected = 'repo:sangimed/nuvitae is:issue is:open label:horizon:now'
           Match = $true },
        @{ Actual = 'repo:sangimed/nuvitae is:issue is:open label:horizon:later'
           Expected = 'repo:sangimed/nuvitae is:issue is:open label:horizon:now'
           Match = $false },
        @{ Actual = 'repo:sangimed/nuvitae is:issue is:open label:horizon:now'
           Expected = 'repo:sangimed/nuvitae is:issue is:open label:horizon:now is:pr'
           Match = $false }
    )
    foreach ($test in $tests) {
        $actual = [pscustomobject] @{ layout = 'BOARD_LAYOUT'; filter = $test.Actual }
        $expected = [pscustomobject] @{ Layout = 'BOARD_LAYOUT'; Filter = $test.Expected }
        $match = Test-ProjectViewMatches -View $actual -Spec $expected
        if ($match -ne $test.Match) {
            throw "Echec autotest : attendu=$($test.Match), obtenu=$match."
        }
    }
    Write-Host "Autotests OK : $($tests.Count) cas pour la comparaison des vues."
    exit 0
}

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    throw 'GitHub CLI (gh) est introuvable. Installer https://cli.github.com/ puis executer gh auth login -s project.'
}

function Invoke-GhJson {
    param([string[]] $CliArgs)

    $output = & gh @CliArgs 2>&1
    if ($LASTEXITCODE -ne 0) {
        $details = ($output | Out-String).Trim()
        throw "GitHub CLI a echoue. Verifier gh auth status et gh auth refresh -s project. Details : $details"
    }

    $raw = ($output | Out-String).Trim()
    if ([string]::IsNullOrWhiteSpace($raw)) {
        throw 'GitHub CLI a renvoye une reponse JSON vide.'
    }

    try {
        return ConvertFrom-Json -InputObject $raw
    }
    catch {
        throw "Reponse GitHub non JSON : $($_.Exception.Message)"
    }
}

function Get-ProjectSnapshot {
    param([string] $Id)

    $query = @'
query ($id: ID!) {
  node(id: $id) {
    ... on ProjectV2 {
      id
      title
      url
      viewerCanUpdate
      views(first: 100) {
        nodes {
          id
          name
          layout
          filter
          number
        }
        pageInfo { hasNextPage }
      }
    }
  }
}
'@

    $response = Invoke-GhJson -CliArgs @('api', 'graphql', '-f', "query=$query", '-f', "id=$Id")
    $snapshot = $response.data.node

    if ($null -eq $snapshot -or -not $snapshot.id) {
        throw 'Impossible de lire le Project via GraphQL (scope project ou permissions manquantes).'
    }
    if ($snapshot.views.pageInfo.hasNextPage) {
        throw 'Le Project contient plus de 100 vues. Arret preventif pour eviter des doublons.'
    }

    return $snapshot
}

# Identifier exclusivement un Project existant dont le titre contient Nuvitae.
if ($ProjectNumber -eq 0) {
    $listing = Invoke-GhJson -CliArgs @('project', 'list', '--owner', $Owner, '--format', 'json', '--limit', '100')
    if ($null -eq $listing.PSObject.Properties['projects']) {
        throw 'Format inattendu pour gh project list. Mettre gh a jour.'
    }

    $candidates = @($listing.projects | Where-Object { $_.title -match 'Nuvitae' })
    if ($candidates.Count -ne 1) {
        $names = (@($listing.projects | ForEach-Object { "$($_.number): $($_.title)" }) -join '; ')
        throw "Projet Nuvitae non unique chez $Owner ($($candidates.Count) resultat(s)). Projets : $names. Passer -ProjectNumber et si necessaire -Owner."
    }

    $ProjectNumber = [int] $candidates[0].number
}

$project = Invoke-GhJson -CliArgs @('project', 'view', "$ProjectNumber", '--owner', $Owner, '--format', 'json')
if (-not $project.id -or $project.title -notmatch 'Nuvitae') {
    throw "Projet cible inattendu : #$ProjectNumber / $($project.title). Aucune modification effectuee."
}

$snapshot = Get-ProjectSnapshot -Id $project.id
if (-not $snapshot.viewerCanUpdate) {
    throw 'Le compte GitHub authentifie ne peut pas modifier ce Project.'
}

Write-Host "Project : $($snapshot.title) ($($snapshot.url))"
Write-Host ('Mode : ' + $(if ($Apply) { 'APPLY' } else { 'PREVIEW (aucune modification)' }))

$specs = @(
    [pscustomobject]@{
        Name = 'Cockpit'
        Layout = 'TABLE_LAYOUT'
        Filter = "repo:$Repo is:issue is:open label:roadmap"
    },
    [pscustomobject]@{
        Name = 'Current Cycle'
        Layout = 'BOARD_LAYOUT'
        Filter = ('repo:{0} is:issue is:open label:"horizon:now"' -f $Repo)
    },
    [pscustomobject]@{
        Name = 'Release Readiness'
        Layout = 'TABLE_LAYOUT'
        Filter = ('repo:{0} is:open label:"horizon:now","release:community-alpha"' -f $Repo)
    },
    [pscustomobject]@{
        Name = 'Backlog / Later'
        Layout = 'TABLE_LAYOUT'
        Filter = ('repo:{0} is:issue is:open label:"horizon:next","horizon:later"' -f $Repo)
    }
)

# Preflight de l'inventaire, sans ecriture : on n'ajoute que les cartes absentes.
$desiredUrls = @()
$missingUrls = @()

if (-not $SkipItems) {
    $issues = @(Invoke-GhJson -CliArgs @('issue', 'list', '--repo', $Repo, '--state', 'open', '--label', 'roadmap', '--json', 'number,url', '--limit', '1000'))
    $prs = @(Invoke-GhJson -CliArgs @('pr', 'list', '--repo', $Repo, '--state', 'open', '--label', 'release:community-alpha', '--json', 'number,url', '--limit', '1000'))

    # ConvertFrom-Json -InputObject may return an array as one pipeline object.
    # Count the extracted URLs, not the wrapped PowerShell array.
    $issueUrls = @($issues | ForEach-Object { $_.url })
    $prUrls = @($prs | ForEach-Object { $_.url })
    $desiredUrls = @(@($issueUrls) + @($prUrls) | Sort-Object -Unique)
    if ($desiredUrls.Count -eq 0) {
        throw 'Aucune issue/PR cible trouvee. Arret preventif.'
    }

    $items = Invoke-GhJson -CliArgs @('project', 'item-list', "$ProjectNumber", '--owner', $Owner, '--format', 'json', '--limit', '1000')
    if ($null -eq $items.PSObject.Properties['items']) {
        throw 'Reponse inattendue pour gh project item-list. Arret preventif.'
    }
    $existingItems = @($items.items | Where-Object { $null -ne $_ })
    if ($null -ne $items.PSObject.Properties['totalCount'] -and [int] $items.totalCount -gt $existingItems.Count) {
        throw 'Inventaire des items tronque : augmenter la limite avant toute ecriture.'
    }

    $known = @{}
    foreach ($item in $existingItems) {
        if ($null -ne $item.content -and $null -ne $item.content.PSObject.Properties['url'] -and $item.content.url) {
            $key = ([string] $item.content.url).TrimEnd('/').ToLowerInvariant()
            $known[$key] = $true
        }
    }

    $missingUrls = @($desiredUrls | Where-Object {
        -not $known.ContainsKey(([string] $_).TrimEnd('/').ToLowerInvariant())
    })

    Write-Host "Issues roadmap : $($issueUrls.Count) ; PR alpha : $($prUrls.Count)."
    Write-Host "Cartes absentes du Project : $($missingUrls.Count) / $($desiredUrls.Count)."
}

$createMutation = @'
mutation ($projectId: ID!, $name: String!, $layout: ProjectV2ViewLayout!) {
  createProjectV2View(input: {projectId: $projectId, name: $name, layout: $layout}) {
    projectV2View { id name layout filter }
  }
}
'@

$updateMutation = @'
mutation ($viewId: ID!, $filter: String!, $layout: ProjectV2ViewLayout!) {
  updateProjectV2View(input: {viewId: $viewId, filter: $filter, layout: $layout}) {
    projectV2View { id name layout filter }
  }
}
'@

foreach ($spec in $specs) {
    $matchesForName = @($snapshot.views.nodes | Where-Object { $_.name -eq $spec.Name })
    if ($matchesForName.Count -gt 1) {
        throw "Plusieurs vues '$($spec.Name)' existent : verification manuelle requise."
    }

    if ($matchesForName.Count -eq 0) {
        Write-Host "CREER : $($spec.Name) [$($spec.Layout)] / $($spec.Filter)"
        if ($Apply) {
            $created = Invoke-GhJson -CliArgs @(
                'api', 'graphql', '-f', "query=$createMutation",
                '-f', "projectId=$($project.id)", '-f', "name=$($spec.Name)",
                '-f', "layout=$($spec.Layout)"
            )
            $newId = $created.data.createProjectV2View.projectV2View.id
            if (-not $newId) { throw "Creation non confirmee : $($spec.Name)." }

            # La creation ne prend pas de filtre : l'appliquer dans une seconde mutation.
            $null = Invoke-GhJson -CliArgs @(
                'api', 'graphql', '-f', "query=$updateMutation",
                '-f', "viewId=$newId", '-f', "filter=$($spec.Filter)",
                '-f', "layout=$($spec.Layout)"
            )
        }
    }
    else {
        $current = $matchesForName[0]
        if (Test-ProjectViewMatches -View $current -Spec $spec) {
            Write-Host "OK : $($spec.Name) deja conforme."
        }
        else {
            Write-Host "METTRE A JOUR : $($spec.Name) [$($spec.Layout)] / $($spec.Filter)"
            Write-Host "  Configuration GitHub actuelle : [$($current.layout)] / $($current.filter)"
            if ($Apply) {
                $null = Invoke-GhJson -CliArgs @(
                    'api', 'graphql', '-f', "query=$updateMutation",
                    '-f', "viewId=$($current.id)", '-f', "filter=$($spec.Filter)",
                    '-f', "layout=$($spec.Layout)"
                )
            }
        }
    }
}

if (-not $SkipItems) {
    foreach ($url in $missingUrls) {
        Write-Host "AJOUTER CARTE : $url"
        if ($Apply) {
            $null = Invoke-GhJson -CliArgs @(
                'project', 'item-add', "$ProjectNumber",
                '--owner', $Owner, '--url', "$url", '--format', 'json'
            )
        }
    }
}

if (-not $Apply) {
    Write-Host 'Previsualisation terminee. Executer avec -Apply pour enregistrer.'
    exit 0
}

# GitHub may normalize filter quoting. Verify the effective meaning, and
# display the exact values returned by GitHub on any mismatch.
$after = Get-ProjectSnapshot -Id $project.id
foreach ($spec in $specs) {
    $views = @($after.views.nodes | Where-Object { $_.name -eq $spec.Name })
    if ($views.Count -ne 1) {
        throw "Verification de '$($spec.Name)' : $($views.Count) vues avec ce nom, 1 attendue."
    }

    $view = $views[0]
    if (-not (Test-ProjectViewMatches -View $view -Spec $spec)) {
        $expectedFilter = Normalize-ProjectViewFilter -Value $spec.Filter
        $actualFilter = Normalize-ProjectViewFilter -Value $view.filter
        $message = ("Verification de '{0}' : configuration differente. " +
            "Layout attendu='{1}', recu='{2}'. " +
            "Filter attendu='{3}', recu='{4}'. " +
            "Aucune suppression ni recreation automatique.") -f
            $spec.Name, $spec.Layout, $view.layout, $expectedFilter, $actualFilter
        throw $message
    }
    Write-Host "VERIFIE : $($spec.Name) [$($view.layout)] / $($view.filter)"
}

if (-not $SkipItems) {
    $finalItems = Invoke-GhJson -CliArgs @('project', 'item-list', "$ProjectNumber", '--owner', $Owner, '--format', 'json', '--limit', '1000')
    $finalUrls = @{}
    foreach ($item in @($finalItems.items)) {
        if ($null -ne $item -and $null -ne $item.content -and $item.content.url) {
            $finalUrls[([string] $item.content.url).TrimEnd('/').ToLowerInvariant()] = $true
        }
    }
    $stillMissing = @($desiredUrls | Where-Object {
        -not $finalUrls.ContainsKey(([string] $_).TrimEnd('/').ToLowerInvariant())
    })
    if ($stillMissing.Count -gt 0) {
        throw "Verification finale : $($stillMissing.Count) cartes encore absentes."
    }
}

Write-Host "SUCCES : les 4 vues et les cartes cibles sont verifiees dans $($snapshot.url)"
Write-Host 'Note : GitHub GraphQL ne permet pas de definir ici le regroupement manuel des colonnes du Board.'
