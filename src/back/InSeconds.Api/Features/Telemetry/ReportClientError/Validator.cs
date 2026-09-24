using FluentValidation;

namespace InSeconds.Api.Features.Telemetry.ReportClientError;

// Endpoint public : bornes strictes pour qu'un client ne puisse pas injecter des logs géants.
public sealed class ReportClientErrorValidator : AbstractValidator<ReportClientErrorCommand>
{
    public static readonly string[] AllowedSources = ["js", "http"];

    public ReportClientErrorValidator()
    {
        RuleFor(x => x.Source).Must(s => AllowedSources.Contains(s));
        RuleFor(x => x.Message).NotEmpty().MaximumLength(1000);
        RuleFor(x => x.Stack).MaximumLength(8000);
        RuleFor(x => x.Url).MaximumLength(500);
        RuleFor(x => x.HttpStatus).InclusiveBetween(0, 599).When(x => x.HttpStatus is not null);
        RuleFor(x => x.RelatedTraceId).MaximumLength(64);
    }
}
