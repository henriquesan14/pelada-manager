using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Pelada.Api.Migrations
{
    /// <inheritdoc />
    public partial class RentalPhotos : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "RentalPhotos",
                columns: table => new
                {
                    Id = table.Column<string>(type: "text", nullable: false),
                    RentalId = table.Column<string>(type: "text", nullable: false),
                    ContentType = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    Data = table.Column<byte[]>(type: "bytea", nullable: false),
                    UploadedBy = table.Column<string>(type: "text", nullable: false),
                    UploadedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RentalPhotos", x => x.Id);
                    table.ForeignKey(
                        name: "FK_RentalPhotos_AspNetUsers_UploadedBy",
                        column: x => x.UploadedBy,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_RentalPhotos_RentalId",
                table: "RentalPhotos",
                column: "RentalId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_RentalPhotos_UploadedBy",
                table: "RentalPhotos",
                column: "UploadedBy");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "RentalPhotos");
        }
    }
}
