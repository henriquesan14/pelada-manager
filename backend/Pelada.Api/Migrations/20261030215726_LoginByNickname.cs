using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Pelada.Api.Migrations
{
    /// <inheritdoc />
    public partial class LoginByNickname : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                DO $migration$
                DECLARE
                    account RECORD;
                    base_nick TEXT;
                    candidate TEXT;
                    suffix INTEGER;
                BEGIN
                    FOR account IN SELECT "Id", "UserName" FROM "AspNetUsers"
                        WHERE "UserName" LIKE '%@%' ORDER BY "Id"
                    LOOP
                        base_nick := left(regexp_replace(lower(split_part(account."UserName", '@', 1)), '[^a-z0-9._-]', '', 'g'), 24);
                        IF length(base_nick) < 3 THEN base_nick := 'organizador'; END IF;
                        candidate := base_nick;
                        suffix := 1;
                        WHILE EXISTS (SELECT 1 FROM "AspNetUsers" WHERE "NormalizedUserName" = upper(candidate) AND "Id" <> account."Id")
                        LOOP
                            suffix := suffix + 1;
                            candidate := left(base_nick, 23 - length(suffix::TEXT)) || '_' || suffix::TEXT;
                        END LOOP;
                        UPDATE "AspNetUsers" SET "UserName" = candidate, "NormalizedUserName" = upper(candidate)
                            WHERE "Id" = account."Id";
                    END LOOP;
                END $migration$;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Only legacy accounts have an email; new nick-only accounts are preserved.
            migrationBuilder.Sql("""
                UPDATE "AspNetUsers" SET "UserName" = lower("Email"), "NormalizedUserName" = upper("Email")
                    WHERE "Email" IS NOT NULL AND "UserName" NOT LIKE '%@%';
                """);
        }
    }
}
