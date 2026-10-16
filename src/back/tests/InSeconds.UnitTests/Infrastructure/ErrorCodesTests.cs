using InSeconds.Api.Infrastructure.Errors;
using Microsoft.AspNetCore.Http;

namespace InSeconds.UnitTests.Infrastructure;

public class ErrorCodesTests
{
    [Theory]
    [InlineData(StatusCodes.Status400BadRequest, ErrorCodes.BadRequest)]
    [InlineData(StatusCodes.Status401Unauthorized, ErrorCodes.Unauthorized)]
    [InlineData(StatusCodes.Status403Forbidden, ErrorCodes.Forbidden)]
    [InlineData(StatusCodes.Status404NotFound, ErrorCodes.NotFound)]
    [InlineData(StatusCodes.Status409Conflict, ErrorCodes.Conflict)]
    [InlineData(StatusCodes.Status429TooManyRequests, ErrorCodes.TooManyRequests)]
    [InlineData(StatusCodes.Status500InternalServerError, ErrorCodes.Unexpected)]
    [InlineData(StatusCodes.Status503ServiceUnavailable, ErrorCodes.Unexpected)]
    public void ForStatus_DonneUnCodeStable(int status, string expected) =>
        Assert.Equal(expected, ErrorCodes.ForStatus(status));
}
