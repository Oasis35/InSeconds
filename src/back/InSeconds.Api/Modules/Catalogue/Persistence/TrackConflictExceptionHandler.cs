using InSeconds.Api.Infrastructure.Persistence;
using InSeconds.Api.Modules.Catalogue.Application;
using Microsoft.AspNetCore.Mvc;

namespace InSeconds.Api.Modules.Catalogue.Persistence;

/// <summary>
/// Deux ajouts (ou une actualisation et un ajout) du même identifiant Deezer au même moment : les deux passent
/// la vérification préalable, l'index unique refuse le second à l'enregistrement. Réponse 409
/// <c>catalogue.duplicate_deezer_id</c>, comme la vérification préalable, au lieu d'un 500 ; deux thèmes qui prennent le même nom au même moment : 409 <c>catalogue.theme_name_taken</c>. Deux ajouts (ou une actualisation et un ajout) qui écrivent en même temps le même genre neuf (album partagé) : le second est refusé sur la clé
/// du genre, 409 <c>catalogue.concurrent_add</c> (« réessaie »). Deux imports du même identifiant au même moment (sas « À valider ») : même réponse, le réessai retrouve le candidat. La transaction est déjà annulée.
/// </summary>
internal sealed class TrackConflictExceptionHandler(IProblemDetailsService problemDetails)
    : UniqueViolationExceptionHandler(problemDetails, ProblemFor)
{
    internal static ProblemDetails? ProblemFor(Exception exception) =>
        ViolatedConstraint(exception) switch
        {
            TrackConfiguration.DeezerIdIndex => CatalogueProblems.DuplicateDeezerId(),
            // Deux imports du même identifiant au même moment : le second est refusé, il réessaie et retrouve le candidat.
            GenreConfiguration.PrimaryKey or CandidateConfiguration.DeezerIdIndex => CatalogueProblems.ConcurrentAdd(),
            ThemeConfiguration.NameIndex => CatalogueProblems.ThemeNameTaken(),
            _ => null,
        };
}
